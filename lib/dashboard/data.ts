import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";
import { findOrgForUser } from "@/db/queries";
import {
  checkQuota,
  effectivePlan,
  hasProAccess,
  startOfUtcMonth,
  watchTopicLimit,
} from "@/lib/billing/limits";
import {
  countOrgChecksSince,
  getOrgCheck,
  listOrgChecks,
} from "@/lib/check/store";
import { listWatchTopics } from "@/lib/watch/store";

/**
 * Server-only reads for the account dashboard. Every entry point re-checks the
 * session (server actions and pages can be hit directly), then resolves the
 * tenant from the user's membership.
 */

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

/* ------------------------------------------------------------------ */
/* PainProof Pro dashboard                                             */
/* ------------------------------------------------------------------ */

export async function getProDashboardData() {
  const user = await requireDashboardUser();
  const membership = await findOrgForUser(user.id);
  if (!membership) {
    return { user, org: null, plan: null, pro: false } as const;
  }

  const { org } = membership;
  const plan = effectivePlan(org);
  const [used, checks, topics] = await Promise.all([
    countOrgChecksSince(org.id, startOfUtcMonth()),
    listOrgChecks(org.id, 25),
    listWatchTopics(org.id),
  ]);

  return {
    user,
    org,
    plan,
    pro: hasProAccess(plan),
    quota: checkQuota(plan),
    used,
    topicLimit: watchTopicLimit(plan),
    checks,
    topics,
    canManageBilling: Boolean(org.stripeCustomerId),
  } as const;
}

/** One Pro check for the signed-in user's workspace, or null. */
export async function getDashboardCheck(checkId: string) {
  const user = await requireDashboardUser();
  const membership = await findOrgForUser(user.id);
  if (!membership) return null;
  return getOrgCheck(membership.org.id, checkId);
}
