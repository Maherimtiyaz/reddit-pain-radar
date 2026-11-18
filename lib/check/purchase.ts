/**
 * Selling a check: Stripe Checkout ($9 one-time) → webhook marks it paid →
 * the check runs after the webhook responds → the private link is emailed.
 *
 * Every step is idempotent and atomic on the row's status, so Stripe
 * redeliveries, double clicks and the recovery paths never run a check twice
 * or charge twice.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db";
import { ideaChecks, type IdeaCheck } from "@/db/schema";
import { safeEqualHex } from "@/lib/auth/api-key";
import {
  checkPath,
  createIdeaCheck,
  hashAccessToken,
  runStoredCheck,
} from "@/lib/check/store";
import { sendCheckReadyEmail } from "@/lib/email/check-ready";
import { lazyChatJson } from "@/lib/llm/client";
import { getStripe } from "@/lib/stripe/client";

/** Metadata marker distinguishing check purchases from subscriptions. */
export const CHECK_METADATA_KIND = "idea_check";

/** A paid check not started within this window is (re)started on demand. */
export const QUEUED_STALE_MS = 60_000;
/** A check `running` longer than this was killed mid-flight; requeue it. */
export const RUNNING_STALE_MS = 10 * 60_000;

export type StartCheckoutInput = {
  idea: string;
  email: string;
  /** Absolute origin for Stripe's return URLs, e.g. https://painproof.co */
  origin: string;
};

/** Create the pending check + its Checkout Session; returns where to send the buyer. */
export async function startCheckCheckout(
  input: StartCheckoutInput,
): Promise<{ checkId: string; url: string }> {
  const price = process.env.STRIPE_PRICE_CHECK?.trim();
  if (!price) throw new Error("STRIPE_PRICE_CHECK is not configured.");

  const { id, token } = await createIdeaCheck({
    idea: input.idea,
    email: input.email,
    origin: "checkout",
    status: "pending_payment",
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      customer_email: input.email,
      // Lets the founder hand out 100%-off codes to early testers.
      allow_promotion_codes: true,
      client_reference_id: id,
      // Stripe already sees the token in success_url; carrying it in metadata
      // lets the webhook email the private link (verified against the hash).
      metadata: { kind: CHECK_METADATA_KIND, ideaCheckId: id, t: token },
      success_url: `${input.origin}${checkPath(id, token)}&paid=1`,
      cancel_url: `${input.origin}/check?canceled=1`,
    });
  } catch (error) {
    // Don't leave an orphan pending row behind a failed Stripe call.
    await db.delete(ideaChecks).where(eq(ideaChecks.id, id));
    throw error;
  }
  if (!session.url) throw new Error("Stripe returned a session without a URL.");

  await db
    .update(ideaChecks)
    .set({ stripeCheckoutSessionId: session.id })
    .where(eq(ideaChecks.id, id));

  return { checkId: id, url: session.url };
}

/** Paid, or a 100%-off promotion code (no payment required). */
export function isSessionPaid(
  session: Pick<Stripe.Checkout.Session, "payment_status">,
): boolean {
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}

export type PaidCheck = { checkId: string; token: string | null };

/**
 * `pending_payment` → `queued`, exactly once. Returns null when the session
 * is not ours, not paid yet, or was already processed (redelivery).
 */
export async function markCheckPaid(
  session: Stripe.Checkout.Session,
): Promise<PaidCheck | null> {
  const checkId = session.metadata?.ideaCheckId;
  if (!checkId || !isSessionPaid(session)) return null;

  const [row] = await db
    .update(ideaChecks)
    .set({ status: "queued", paidAt: new Date() })
    .where(
      and(
        eq(ideaChecks.id, checkId),
        eq(ideaChecks.status, "pending_payment"),
        eq(ideaChecks.stripeCheckoutSessionId, session.id),
      ),
    )
    .returning({
      id: ideaChecks.id,
      accessTokenHash: ideaChecks.accessTokenHash,
    });
  if (!row) return null;

  const token = session.metadata?.t ?? null;
  const tokenValid =
    token !== null && safeEqualHex(row.accessTokenHash, hashAccessToken(token));
  if (token && !tokenValid) {
    console.error("[check] session token does not match check", { checkId });
  }
  return { checkId: row.id, token: tokenValid ? token : null };
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    process.env.AUTH_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/** Run a paid check and email the buyer. Safe to call more than once. */
export async function runPaidCheck(paid: PaidCheck): Promise<IdeaCheck | null> {
  const row = await runStoredCheck(paid.checkId, { llm: lazyChatJson() });
  if (!row || !row.email) return row;

  if (row.status === "complete" && row.result && paid.token) {
    await sendCheckReadyEmail({
      to: row.email,
      headline: row.result.headline,
      verdict: row.result.verdict,
      score: row.result.score,
      url: `${siteOrigin()}${checkPath(row.id, paid.token)}`,
    });
  } else if (row.status === "failed") {
    console.error("[check] paid check failed — follow up with the buyer", {
      checkId: row.id,
      email: row.email,
      error: row.error,
    });
  }
  return row;
}

/**
 * Put a stuck check back in the queue: paid but never started, or `running`
 * so long the worker must have been killed. Returns true if it is now
 * runnable by this caller.
 */
export async function requeueIfStale(
  check: Pick<
    IdeaCheck,
    "id" | "status" | "paidAt" | "createdAt" | "startedAt"
  >,
  now: Date = new Date(),
): Promise<boolean> {
  if (check.status === "queued") {
    const since = check.paidAt ?? check.createdAt;
    return now.getTime() - since.getTime() >= QUEUED_STALE_MS;
  }
  if (check.status !== "running" || !check.startedAt) return false;
  if (now.getTime() - check.startedAt.getTime() < RUNNING_STALE_MS)
    return false;

  const [row] = await db
    .update(ideaChecks)
    .set({ status: "queued" })
    .where(
      and(
        eq(ideaChecks.id, check.id),
        eq(ideaChecks.status, "running"),
        lt(ideaChecks.startedAt, new Date(now.getTime() - RUNNING_STALE_MS)),
      ),
    )
    .returning({ id: ideaChecks.id });
  return Boolean(row);
}

/** Every paid check that is stuck (for `npm run check:resume`). */
export async function findStuckChecks(
  now: Date = new Date(),
): Promise<IdeaCheck[]> {
  return db
    .select()
    .from(ideaChecks)
    .where(
      or(
        and(
          eq(ideaChecks.status, "queued"),
          lt(ideaChecks.createdAt, new Date(now.getTime() - QUEUED_STALE_MS)),
        ),
        and(
          eq(ideaChecks.status, "running"),
          or(
            isNull(ideaChecks.startedAt),
            lt(
              ideaChecks.startedAt,
              new Date(now.getTime() - RUNNING_STALE_MS),
            ),
          ),
        ),
      ),
    );
}
