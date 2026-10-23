import Stripe from "stripe";

/**
 * Lazily-constructed Stripe client (server-only).
 *
 * Built on first use so a missing key surfaces as a clear configuration
 * error in the webhook route (503) instead of crashing module import on
 * deploys that do not configure billing.
 */

let client: Stripe | null = null;

/** True when both vars the webhook route needs are present. */
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  );
}

/** Shared Stripe instance. Throws when `STRIPE_SECRET_KEY` is unset. */
export function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  client ??= new Stripe(apiKey);
  return client;
}
