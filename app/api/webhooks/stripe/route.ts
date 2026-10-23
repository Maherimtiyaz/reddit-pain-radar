import type Stripe from "stripe";

import { apiError, json } from "@/lib/api/http";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { handleStripeEvent, recordStripeEvent } from "@/lib/stripe/webhook";

/**
 * Stripe billing webhook.
 *
 * Authenticity comes from the `Stripe-Signature` header (verified with
 * `STRIPE_WEBHOOK_SECRET`), not an API key. Configure these events on the
 * Stripe endpoint:
 * - checkout.session.completed   -> provision org + API key + welcome email
 * - customer.subscription.updated -> sync plan (incl. dunning downgrades)
 * - customer.subscription.deleted -> downgrade to trial
 * - invoice.payment_failed       -> audit log entry
 *
 * Status codes: 2xx acknowledges; 400 is a bad request Stripe will not
 * retry; 5xx makes Stripe retry with backoff (used for transient DB/email
 * failures so no customer falls through the cracks).
 */
export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    return apiError(
      503,
      "Stripe is not configured on this server.",
      "not_configured",
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return apiError(
      400,
      "Missing Stripe-Signature header.",
      "invalid_signature",
    );
  }

  // Raw body is required — JSON re-serialization would break signatures.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (error) {
    console.warn("[stripe] signature verification failed", error);
    return apiError(400, "Invalid Stripe signature.", "invalid_signature");
  }

  try {
    const outcome = await handleStripeEvent(event);
    const firstDelivery = await recordStripeEvent(event);
    console.log("[stripe] handled event", {
      type: event.type,
      eventId: event.id,
      firstDelivery,
      outcome,
    });
    return json({ received: true });
  } catch (error) {
    // Not recorded and not 2xx — Stripe will retry the same event.
    console.error(
      "[stripe] handler failed; Stripe will retry",
      { type: event.type, eventId: event.id },
      error,
    );
    return apiError(500, "Webhook handler failed.", "handler_failed");
  }
}
