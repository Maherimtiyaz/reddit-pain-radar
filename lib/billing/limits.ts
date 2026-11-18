import type { Org } from "@/db/schema";

/**
 * Plan limits — the single source of truth for what each plan may do.
 *
 * Quotas are enforced by `lib/check/pro.ts` (dashboard + POST /api/v1/checks)
 * and surfaced through GET /api/v1/me. A trial lasts `TRIAL_DAYS` from org creation; once
 * expired it behaves as a $0 plan until the customer subscribes (Stripe
 * webhooks flip `orgs.plan` back to a paid tier on checkout).
 */

export const TRIAL_DAYS = 14;

/**
 * The plan the API actually enforces. `expired_trial` is derived, not
 * stored: it keeps trial enforcement cron-free while `orgs.plan` stays the
 * billing source of truth owned by the Stripe webhooks.
 */
export type EffectivePlan = "trial" | "starter" | "pro" | "expired_trial";

/** Resolves the enforceable plan, applying trial expiry. */
export function effectivePlan(
  org: Pick<Org, "plan" | "createdAt">,
): EffectivePlan {
  if (org.plan !== "trial") return org.plan;
  const expiresAt = org.createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() < expiresAt ? "trial" : "expired_trial";
}

/** Start of the current quota window (calendar month, UTC). */
export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/* ------------------------------------------------------------------ */
/* PainProof Pro                                                       */
/* ------------------------------------------------------------------ */

/**
 * Idea checks per calendar month (UTC) included in a subscription. Each check
 * costs real model tokens, so "unlimited" is a fair-use cap. `starter` is the
 * legacy subscription price and gets the same allowance as Pro.
 */
const CHECK_QUOTA: Record<EffectivePlan, number> = {
  trial: 0,
  expired_trial: 0,
  starter: 30,
  pro: 30,
};

/** Niche-watch topics a workspace may follow. */
const WATCH_TOPIC_LIMIT: Record<EffectivePlan, number> = {
  trial: 0,
  expired_trial: 0,
  starter: 5,
  pro: 5,
};

export function checkQuota(plan: EffectivePlan): number {
  return CHECK_QUOTA[plan];
}

export function watchTopicLimit(plan: EffectivePlan): number {
  return WATCH_TOPIC_LIMIT[plan];
}

/** True when the plan has subscription features (Pro or legacy starter). */
export function hasProAccess(plan: EffectivePlan): boolean {
  return plan === "pro" || plan === "starter";
}
