import type { Org } from "@/db/schema";

/**
 * Plan limits — the single source of truth for what each plan may do.
 *
 * Quotas are enforced in the v1 API (see POST /api/v1/reports) and surfaced
 * through GET /api/v1/me. A trial lasts `TRIAL_DAYS` from org creation; once
 * expired it behaves as a $0 plan until the customer subscribes (Stripe
 * webhooks flip `orgs.plan` back to a paid tier on checkout).
 */

export const TRIAL_DAYS = 14;

/** Monthly report generation quota per paid plan. */
const REPORT_QUOTA: Record<"trial" | "starter" | "pro", number> = {
  trial: 3,
  starter: 50,
  pro: 500,
};

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

/** Reports per calendar month (UTC) the plan may generate. */
export function reportQuota(plan: EffectivePlan): number {
  return plan === "expired_trial" ? 0 : REPORT_QUOTA[plan];
}

/** Start of the current quota window (calendar month, UTC). */
export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
