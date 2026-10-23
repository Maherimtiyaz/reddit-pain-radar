import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { adminDb } from "@/db/admin";
import {
  createApiKeyRecord,
  createOrgWithOwner,
  findOrgByStripeCustomerId,
  setOrgPlan,
} from "@/db/queries";
import { orgs, stripeEvents } from "@/db/schema";
import { generateApiKey } from "@/lib/auth/api-key";
import { sendWelcomeEmail } from "@/lib/email/welcome";

/**
 * Stripe webhook business logic, kept out of the route handler so it can be
 * exercised by the smoke script and (later) by tests.
 *
 * Handlers are idempotent on purpose — Stripe redelivers events until it
 * gets a 2xx, and deliveries can race:
 * - checkout: an existing org for the customer short-circuits provisioning
 * - plan sync: the write is absolute (set to X), never incremental
 * The `stripe_events` table (recorded after success) makes redeliveries
 * auditable but is not the correctness boundary.
 */

export type StripeOutcome =
  | { status: "provisioned"; orgId: string }
  | { status: "already_provisioned"; orgId: string }
  | { status: "plan_synced"; orgId: string; plan: string }
  | { status: "logged"; reason: string }
  | { status: "ignored"; reason: string };

type PaidPlan = "starter" | "pro";

export async function handleStripeEvent(
  event: Stripe.Event,
): Promise<StripeOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event.data.object);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data.object);
    default:
      return { status: "ignored", reason: `no handler for ${event.type}` };
  }
}

/**
 * Persists a successfully-handled event for audit. Returns `false` when the
 * event id was already recorded (a redelivery).
 */
export async function recordStripeEvent(event: Stripe.Event): Promise<boolean> {
  const rows = await adminDb
    .insert(stripeEvents)
    .values({ stripeEventId: event.id, type: event.type, payload: event })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

/**
 * A completed subscription checkout is the moment a customer is born:
 * create the org + owner, record the Stripe customer, mint the first API
 * key, and email it so the product is in their inbox within seconds.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<StripeOutcome> {
  if (session.mode !== "subscription") {
    return { status: "ignored", reason: `checkout mode ${session.mode}` };
  }

  const customerId = stripeCustomerIdOf(session.customer);
  const email = session.customer_details?.email ?? session.customer_email;

  if (!customerId || !email) {
    // Retrying will not invent the missing data — surface loudly for manual
    // follow-up instead of failing into an endless Stripe retry loop.
    console.error("[stripe] checkout completed without customer id/email", {
      eventId: session.id,
      hasCustomer: Boolean(customerId),
      hasEmail: Boolean(email),
    });
    return { status: "logged", reason: "missing customer id or email" };
  }

  const existing = await findOrgByStripeCustomerId(customerId);
  if (existing) {
    // Redelivery or concurrent duplicate — never mint a second first key.
    return { status: "already_provisioned", orgId: existing.id };
  }

  const displayName = session.customer_details?.name?.trim() || null;
  const orgName = displayName || email.split("@")[0] || "New workspace";
  const plan = planFromMetadata(session.metadata);

  const { orgId } = await createOrgWithOwner({
    email,
    name: displayName,
    orgName,
    slug: await uniqueSlug(orgName),
    stripeCustomerId: customerId,
    plan,
  });

  const { key, keyHash } = generateApiKey();
  await createApiKeyRecord(orgId, { name: "checkout key", keyHash });

  const delivery = await sendWelcomeEmail({ to: email, orgName, apiKey: key });
  console.log("[stripe] provisioned org from checkout", {
    orgId,
    email,
    plan,
    emailed: delivery.delivered,
  });

  return { status: "provisioned", orgId };
}

/**
 * Keep `orgs.plan` in sync with the subscription Stripe holds: paid/active
 * plans map from the price being purchased; anything not active or trialing
 * (past_due, unpaid, incomplete…) falls back to trial until payment works
 * again. Absolute write, so redeliveries are harmless.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<StripeOutcome> {
  const customerId = stripeCustomerIdOf(subscription.customer);
  if (!customerId) {
    return { status: "logged", reason: "subscription without customer id" };
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    console.warn("[stripe] subscription event for unknown customer", {
      customerId,
      subscriptionId: subscription.id,
    });
    return { status: "logged", reason: "unknown customer" };
  }

  const active =
    subscription.status === "active" || subscription.status === "trialing";
  const priceId = subscription.items.data[0]?.price?.id;
  const plan: PaidPlan | "trial" = active
    ? paidPlanFromPriceId(priceId)
    : "trial";

  if (org.plan !== plan) {
    await setOrgPlan(org.id, plan);
    console.log("[stripe] synced plan from subscription", {
      orgId: org.id,
      subscriptionStatus: subscription.status,
      plan,
    });
  }
  return { status: "plan_synced", orgId: org.id, plan };
}

/** Cancellation: drop back to trial (enforcement of trial limits is separate). */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<StripeOutcome> {
  const customerId = stripeCustomerIdOf(subscription.customer);
  if (!customerId) {
    return { status: "logged", reason: "subscription without customer id" };
  }

  const org = await findOrgByStripeCustomerId(customerId);
  if (!org) {
    return { status: "logged", reason: "unknown customer" };
  }

  await setOrgPlan(org.id, "trial");
  console.log("[stripe] downgraded to trial after subscription deletion", {
    orgId: org.id,
  });
  return { status: "plan_synced", orgId: org.id, plan: "trial" };
}

/**
 * A failed invoice is only logged: Stripe retries dunning on its own, and
 * the plan downgrade rides in on the `customer.subscription.updated` event
 * (status `past_due`/`unpaid`) — one source of truth for plan state.
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<StripeOutcome> {
  const customerId = stripeCustomerIdOf(invoice.customer);
  const org = customerId ? await findOrgByStripeCustomerId(customerId) : null;

  console.warn("[stripe] invoice payment failed", {
    orgId: org?.id ?? null,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due,
  });
  return { status: "logged", reason: "invoice payment failed" };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function stripeCustomerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * `metadata.plan` on the checkout session (set by the payment link) wins;
 * otherwise the product defaults to the Starter plan.
 */
function planFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): PaidPlan {
  const raw = metadata?.plan?.toLowerCase();
  return raw === "pro" ? "pro" : "starter";
}

/**
 * Maps the subscribed price to a plan. With no price configured
 * (`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PRO`) everything active is Starter —
 * the current single-product setup.
 */
function paidPlanFromPriceId(priceId: string | undefined): PaidPlan {
  const proPrice = process.env.STRIPE_PRICE_PRO?.trim();
  const starterPrice = process.env.STRIPE_PRICE_STARTER?.trim();

  if (proPrice && priceId === proPrice) return "pro";
  if (starterPrice && priceId === starterPrice) return "starter";
  if (priceId && starterPrice && starterPrice !== priceId) {
    console.warn("[stripe] unknown price id, defaulting to starter", {
      priceId,
    });
  }
  return "starter";
}

/** Org slugs are unique; on collision retry once with a random suffix. */
async function uniqueSlug(orgName: string): Promise<string> {
  const base = slugify(orgName);
  const taken = await adminDb
    .select({ slug: orgs.slug })
    .from(orgs)
    .where(eq(orgs.slug, base))
    .limit(1);
  if (taken.length === 0) return base;
  return `${base}-${randomBytes(2).toString("hex")}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}
