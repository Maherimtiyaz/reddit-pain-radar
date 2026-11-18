import "dotenv/config";

import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { adminDb } from "@/db/admin";
import { apiKeys, ideaChecks, orgs, stripeEvents } from "@/db/schema";
import { generateAccessToken } from "@/lib/check/store";

/**
 * End-to-end smoke test for the Stripe billing webhook.
 *
 * Signs synthetic events with STRIPE_WEBHOOK_SECRET and posts them to a
 * running server, then asserts the provisioning side effects in the
 * database. No Stripe network access is needed.
 *
 * Prereqs: `npm run db:up && npm run db:migrate && npm run db:seed`, then a
 * server started with the same secret the smoke script reads from .env:
 *
 *   STRIPE_SECRET_KEY=sk_test_local STRIPE_WEBHOOK_SECRET=whsec_localtest npm run dev
 *   npm run stripe:smoke
 *
 * Optional: SMOKE_BASE_URL / BASE_URL / PORT for a non-default origin.
 */

const BASE_URL =
  process.env.SMOKE_BASE_URL ??
  process.env.BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();
if (!WEBHOOK_SECRET) {
  console.error(
    "STRIPE_WEBHOOK_SECRET is not set. Start the server (and run this script) with the same secret, e.g.\n" +
      "  STRIPE_SECRET_KEY=sk_test_local STRIPE_WEBHOOK_SECRET=whsec_localtest npm run dev",
  );
  process.exit(1);
}

// Only used for signature helpers; never contacts Stripe's API.
const stripe = new Stripe("sk_test_signature_helper");

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
    return;
  }
  failures.push(label);
  console.error(
    `  \u2717 ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`,
  );
}

let sequence = 0;

function checkoutEvent(input: {
  email: string;
  customerId: string;
  name?: string;
}): Stripe.Event {
  sequence += 1;
  return {
    id: `evt_smoke_${Date.now()}_${sequence}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: {
      object: {
        id: `cs_smoke_${sequence}`,
        object: "checkout.session",
        mode: "subscription",
        customer: input.customerId,
        customer_email: null,
        customer_details: { email: input.email, name: input.name ?? null },
        metadata: {},
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionEvent(input: {
  customerId: string;
  status: string;
  eventId: string;
}): Stripe.Event {
  return {
    id: input.eventId,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.updated",
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: {
      object: {
        id: `sub_smoke_${input.customerId}`,
        object: "subscription",
        customer: input.customerId,
        status: input.status,
        items: { data: [] },
      },
    },
  } as unknown as Stripe.Event;
}

/** A Check My Idea checkout session event (one-time payment). */
function checkSessionEvent(input: {
  type?:
    "checkout.session.completed" | "checkout.session.async_payment_succeeded";
  sessionId: string;
  checkId: string;
  token: string;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
}): Stripe.Event {
  sequence += 1;
  return {
    id: `evt_smoke_check_${Date.now()}_${sequence}`,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: input.type ?? "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: input.paymentStatus,
        customer: null,
        customer_details: { email: "buyer@painproof.test" },
        metadata: {
          kind: "idea_check",
          ideaCheckId: input.checkId,
          t: input.token,
        },
      },
    },
  } as unknown as Stripe.Event;
}

async function insertPendingCheck(
  sessionId: string,
): Promise<{ id: string; token: string }> {
  const { token, tokenHash } = generateAccessToken();
  const [row] = await adminDb
    .insert(ideaChecks)
    .values({
      idea: "Smoke test idea: invoice reminders for freelance designers",
      email: "buyer@painproof.test",
      origin: "checkout",
      status: "pending_payment",
      accessTokenHash: tokenHash,
      stripeCheckoutSessionId: sessionId,
    })
    .returning({ id: ideaChecks.id });
  return { id: row.id, token };
}

async function checkStatus(id: string) {
  const [row] = await adminDb
    .select({
      status: ideaChecks.status,
      paidAt: ideaChecks.paidAt,
      error: ideaChecks.error,
    })
    .from(ideaChecks)
    .where(eq(ideaChecks.id, id));
  return row;
}

async function ideaCheckSmoke(suffix: number): Promise<string[]> {
  console.log("\n  Check My Idea purchases");
  const eventIds: string[] = [];
  const send = async (event: Stripe.Event) => {
    eventIds.push(event.id);
    return post(event);
  };

  // 1. Paid card checkout -> queued (then run after the response).
  const paidSession = `cs_smoke_paid_${suffix}`;
  const paid = await insertPendingCheck(paidSession);
  const paidEvent = checkSessionEvent({
    sessionId: paidSession,
    checkId: paid.id,
    token: paid.token,
    paymentStatus: "paid",
  });
  const first = await send(paidEvent);
  const afterPaid = await checkStatus(paid.id);
  check("paid check session -> 200", first.status === 200, first);
  check(
    "paid check leaves pending_payment and records paid_at",
    afterPaid?.status !== "pending_payment" &&
      afterPaid?.paidAt instanceof Date,
    afterPaid,
  );

  // 2. Redelivery is a no-op.
  const again = await post(paidEvent);
  check("redelivered check event -> 200", again.status === 200, again);

  // 3. Async payment: unpaid at completion, queued on async success.
  const asyncSession = `cs_smoke_async_${suffix}`;
  const pending = await insertPendingCheck(asyncSession);
  await send(
    checkSessionEvent({
      sessionId: asyncSession,
      checkId: pending.id,
      token: pending.token,
      paymentStatus: "unpaid",
    }),
  );
  check(
    "unpaid completion keeps the check pending",
    (await checkStatus(pending.id))?.status === "pending_payment",
  );
  await send(
    checkSessionEvent({
      type: "checkout.session.async_payment_succeeded",
      sessionId: asyncSession,
      checkId: pending.id,
      token: pending.token,
      paymentStatus: "paid",
    }),
  );
  check(
    "async_payment_succeeded queues the check",
    (await checkStatus(pending.id))?.status !== "pending_payment",
  );

  // 4. A session id that doesn't match the check never unlocks it.
  const mismatch = await insertPendingCheck(`cs_smoke_real_${suffix}`);
  await send(
    checkSessionEvent({
      sessionId: `cs_smoke_forged_${suffix}`,
      checkId: mismatch.id,
      token: mismatch.token,
      paymentStatus: "paid",
    }),
  );
  check(
    "mismatched session id keeps the check pending",
    (await checkStatus(mismatch.id))?.status === "pending_payment",
  );

  // 5. 100%-off promo code (no payment required) counts as paid.
  const freeSession = `cs_smoke_free_${suffix}`;
  const free = await insertPendingCheck(freeSession);
  await send(
    checkSessionEvent({
      sessionId: freeSession,
      checkId: free.id,
      token: free.token,
      paymentStatus: "no_payment_required",
    }),
  );
  check(
    "100%-off promo code queues the check",
    (await checkStatus(free.id))?.status !== "pending_payment",
  );

  // 6. The run after the response reaches a terminal state.
  let terminal = await checkStatus(paid.id);
  for (
    let i = 0;
    i < 90 && terminal && !["complete", "failed"].includes(terminal.status);
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    terminal = await checkStatus(paid.id);
  }
  check(
    "paid check runs after the webhook responds (complete, or failed with a reason)",
    terminal?.status === "complete" ||
      (terminal?.status === "failed" && Boolean(terminal.error)),
    terminal,
  );

  for (const id of [paid.id, pending.id, mismatch.id, free.id]) {
    await adminDb.delete(ideaChecks).where(eq(ideaChecks.id, id));
  }
  return eventIds;
}

async function post(
  event: Stripe.Event,
  options: { signature?: string | null } = {},
): Promise<{ status: number; json: unknown }> {
  const payload = JSON.stringify(event);
  const signature =
    options.signature === null
      ? null
      : (options.signature ??
        stripe.webhooks.generateTestHeaderString({
          payload,
          secret: WEBHOOK_SECRET as string,
        }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature) headers["Stripe-Signature"] = signature;

  const response = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers,
    body: payload,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

async function main(): Promise<void> {
  const suffix = Date.now();
  const email = `smoke+${suffix}@redditpainradar.test`;
  const customerId = `cus_smoke_${suffix}`;

  console.log(`\nStripe webhook smoke test against ${BASE_URL}\n`);

  // -- self-serve checkout entry ------------------------------------------
  // The smoke server runs without STRIPE_PRICE_STARTER, so the endpoint must
  // degrade to the waitlist anchor instead of erroring (no Stripe API call).
  const checkout = await fetch(`${BASE_URL}/api/checkout`, {
    redirect: "manual",
  });
  const checkoutLocation = checkout.headers.get("location") ?? "";
  check(
    "GET /api/checkout (no price configured) -> 302 to newsletter signup",
    checkout.status === 302 && checkoutLocation.endsWith("/#subscribe"),
    { status: checkout.status, location: checkoutLocation },
  );

  // -- misconfiguration & signature guards ------------------------------
  const noSignature = await post(checkoutEvent({ email, customerId }), {
    signature: null,
  });
  check(
    "missing signature -> 400",
    noSignature.status === 400,
    noSignature.status,
  );

  const event = checkoutEvent({ email, customerId, name: "Smoke Tester" });
  const tampered = await post(event, { signature: "t=1,v1=deadbeef" });
  check("bad signature -> 400", tampered.status === 400, tampered.status);

  // -- checkout -> provision --------------------------------------------
  const delivered = await post(event);
  check("checkout -> 200", delivered.status === 200, delivered.json);

  const org = await adminDb
    .select()
    .from(orgs)
    .where(eq(orgs.stripeCustomerId, customerId))
    .limit(1);
  check("org provisioned", org.length === 1);
  check("org plan is starter", org[0]?.plan === "starter", org[0]?.plan);
  check(
    "org slug derived",
    (org[0]?.slug ?? "").startsWith("smoke-tester"),
    org[0]?.slug,
  );

  const keys = org[0]
    ? await adminDb
        .select({ id: apiKeys.id, name: apiKeys.name })
        .from(apiKeys)
        .where(eq(apiKeys.orgId, org[0].id))
    : [];
  check("first API key minted", keys.length === 1, keys.length);

  const recorded = await adminDb
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, event.id))
    .limit(1);
  check("event recorded for audit", recorded.length === 1);

  // -- redelivery is idempotent -----------------------------------------
  const redelivered = await post(event);
  check("redelivery -> 200", redelivered.status === 200, redelivered.status);
  const keysAfterRetry = org[0]
    ? await adminDb
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(eq(apiKeys.orgId, org[0].id))
    : [];
  check("redelivery does not mint a second key", keysAfterRetry.length === 1);

  // -- subscription lifecycle -------------------------------------------
  const pastDue = await post(
    subscriptionEvent({
      customerId,
      status: "past_due",
      eventId: `evt_smoke_sub_${suffix}`,
    }),
  );
  check("subscription.updated -> 200", pastDue.status === 200, pastDue.status);
  const downgraded = await adminDb
    .select({ plan: orgs.plan })
    .from(orgs)
    .where(eq(orgs.stripeCustomerId, customerId))
    .limit(1);
  check(
    "past_due subscription downgrades plan to trial",
    downgraded[0]?.plan === "trial",
    downgraded[0]?.plan,
  );

  // -- Check My Idea purchases --------------------------------------------
  const checkEventIds = await ideaCheckSmoke(suffix);

  // -- cleanup -----------------------------------------------------------
  for (const id of checkEventIds) {
    await adminDb
      .delete(stripeEvents)
      .where(eq(stripeEvents.stripeEventId, id));
  }
  if (org[0]) {
    await adminDb.delete(orgs).where(eq(orgs.id, org[0].id));
  }
  await adminDb
    .delete(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, event.id));
  await adminDb
    .delete(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, `evt_smoke_sub_${suffix}`));

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("[stripe-smoke] aborted:", error);
  process.exit(1);
});
