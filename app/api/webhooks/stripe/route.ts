import { after } from "next/server";
import type Stripe from "stripe";

import { apiError, json } from "@/lib/api/http";
import { runPaidCheck } from "@/lib/check/purchase";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  handleStripeEvent,
  loggableOutcome,
  recordStripeEvent,
} from "@/lib/stripe/webhook";

/**
 * A paid Check My Idea runs after the response (via `after`), which is bounded
 * by this route's max duration. Research takes 1–3 minutes.
 */
export const maxDuration = 300;

/**
 * Stripe billing webhook.
 *
 * Authenticity comes from the `Stripe-Signature` header (verified with
 * `STRIPE_WEBHOOK_SECRET`), not an API key. Configure these events on the
 * Stripe endpoint:
 * - checkout.session.completed   -> provision org + API key + welcome email,
 *                                   or (metadata.kind=idea_check) queue a paid check
 * - checkout.session.async_payment_succeeded -> queue a check paid by a delayed method
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
      outcome: loggableOutcome(outcome),
    });
    if (outcome.status === "check_queued") {
      const paid = outcome.paid;
      after(async () => {
        try {
          await runPaidCheck(paid);
        } catch (error) {
          // The row stays queued; the report page / check:resume restart it.
          console.error(
            "[check] paid run crashed",
            { checkId: paid.checkId },
            error,
          );
        }
      });
    }
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
