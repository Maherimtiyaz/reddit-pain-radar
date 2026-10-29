import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";
import {
  countReportsSince,
  findOrgForUser,
  getReport,
  listApiKeys,
  listKeywordSets,
  listReports,
  listSubreddits,
} from "@/db/queries";
import type { Membership } from "@/db/schema";
import {
  effectivePlan,
  reportQuota,
  startOfUtcMonth,
  TRIAL_DAYS,
  type EffectivePlan,
} from "@/lib/billing/limits";

/**
 * Server-only reads for the account dashboard. Every entry point re-checks the
 * session (server actions and pages can be hit directly), then resolves the
 * tenant from the user's membership.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type DashboardUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

/** Current session user, or a redirect to the sign-in page. */
export async function requireDashboardUser(): Promise<DashboardUser> {
  // Mark the render as request-time before touching cookies or the DB. Without
  // this, Cache Components' dev prerender pass flags the session read (and the
  // server-action forms below it) as uncached/unstable.
  await connection();
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) redirect("/login");

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    image: user.image ?? null,
  };
}

export async function getDashboardData() {
  const user = await requireDashboardUser();
  const membership = await findOrgForUser(user.id);

  if (!membership) {
    return {
      user,
      membership: null,
      plan: null as EffectivePlan | null,
      quota: 0,
      used: 0,
      trialEndsAt: null as Date | null,
      trialDaysLeft: null as number | null,
      subreddits: [],
      keywordSets: [],
      apiKeys: [],
      reports: [],
    };
  }

  const { org } = membership;
  const plan = effectivePlan(org);
  const quota = reportQuota(plan);
  const trialEndsAt =
    org.plan === "trial"
      ? new Date(org.createdAt.getTime() + TRIAL_DAYS * DAY_MS)
      : null;
  const trialDaysLeft =
    trialEndsAt === null
      ? null
      : Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY_MS));

  const [used, subreddits, keywordSets, apiKeys, reports] = await Promise.all([
    countReportsSince(org.id, startOfUtcMonth()),
    listSubreddits(org.id),
    listKeywordSets(org.id),
    listApiKeys(org.id),
    listReports(org.id, 8),
  ]);

  return {
    user,
    membership: membership as { org: typeof org; role: Membership["role"] },
    plan,
    quota,
    used,
    trialEndsAt,
    trialDaysLeft,
    subreddits,
    keywordSets,
    apiKeys,
    reports,
  };
}

/** Loads one report for the signed-in user's org, or `null` if not theirs. */
export async function getDashboardReport(reportId: string) {
  const user = await requireDashboardUser();
  const membership = await findOrgForUser(user.id);
  if (!membership) return null;

  return getReport(membership.org.id, reportId);
}
