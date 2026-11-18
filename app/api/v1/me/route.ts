import { getOrg } from "@/db/queries";
import {
  checkQuota,
  effectivePlan,
  startOfUtcMonth,
} from "@/lib/billing/limits";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { countOrgChecksSince } from "@/lib/check/store";

/**
 * GET /api/v1/me — the workspace behind the presented API key and its
 * PainProof Pro allowance (`effectivePlan` folds in inactive subscriptions;
 * the monthly quota counts non-failed checks since the UTC month start).
 */
export const GET = withAuth(async (_request, principal) => {
  const org = await getOrg(principal.orgId);
  if (!org) return apiError(404, "Organization not found.", "not_found");

  const plan = effectivePlan(org);
  const used = await countOrgChecksSince(org.id, startOfUtcMonth());

  return json({
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      effectivePlan: plan,
      checkQuota: checkQuota(plan),
      checksUsedThisMonth: used,
    },
  });
});
