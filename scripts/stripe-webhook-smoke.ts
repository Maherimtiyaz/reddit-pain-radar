import "dotenv/config";

import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { adminDb } from "@/db/admin";
import { apiKeys, orgs, stripeEvents } from "@/db/schema";

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
    "GET /api/checkout (no price configured) -> 302 to waitlist",
    checkout.status === 302 && checkoutLocation.endsWith("/#waitlist"),
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

  // -- cleanup -----------------------------------------------------------
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
