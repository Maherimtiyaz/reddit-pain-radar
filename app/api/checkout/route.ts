import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe/client";
import { site } from "@/lib/site";

/**
 * GET /api/checkout — redirect a landing CTA into Stripe's hosted Checkout.
 *
 * The CTAs are plain `<a href="/api/checkout">` links (they work from server
 * and client sections alike), so the whole resolution chain lives here:
 *
 *   configured (STRIPE_SECRET_KEY + STRIPE_PRICE_STARTER)
 *     -> 302 to a subscription Checkout Session
 *   otherwise -> 302 to the legacy payment link, else the waitlist anchor.
 *
 * The session carries `metadata.plan = "starter"`, which is exactly what the
 * provisioning webhook (`checkout.session.completed`) reads, so a purchase
 * through this path provisions the org + first API key like a payment-link
 * purchase does. Failures degrade the same way as an unconfigured install:
 * the error is logged server-side and the visitor lands on the waitlist
 * instead of a dead end.
 *
 * Rate-limited per IP (in-memory, best-effort — see lib/rate-limit.ts) so
 * crawlers cannot mint Checkout Sessions unbounded.
 */

const RATE_LIMIT = { max: 10, windowMs: 60_000 };

function redirect(
  location: string,
  status = 302,
  headers?: HeadersInit,
): Response {
  return new Response(null, {
    status,
    headers: { Location: location, ...headers },
  });
}

export async function GET(request: Request): Promise<Response> {
  const origin = new URL("/", request.url).origin;
  const fallback = site.stripePaymentLink || `${origin}/#waitlist`;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(
    `checkout:${ip}`,
    RATE_LIMIT.max,
    RATE_LIMIT.windowMs,
  );
  if (!limit.ok) {
    return new Response(
      `Too many checkout attempts. Try again in ${limit.retryAfterSeconds}s.`,
      {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(limit.retryAfterSeconds),
        },
      },
    );
  }

  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  const price = process.env.STRIPE_PRICE_STARTER?.trim();
  if (!apiKey || !price) {
    return redirect(fallback);
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { plan: "starter" },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/#pricing`,
    });
    if (!session.url) {
      console.error("[checkout] session created without url", {
        sessionId: session.id,
      });
      return redirect(fallback);
    }
    return redirect(session.url);
  } catch (error) {
    console.error("[checkout] session creation failed", error);
    return redirect(fallback);
  }
}
