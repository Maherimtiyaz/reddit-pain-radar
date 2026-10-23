import { countReportsSince, getOrg } from "@/db/queries";
import {
  effectivePlan,
  reportQuota,
  startOfUtcMonth,
} from "@/lib/billing/limits";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";

/**
 * GET /api/v1/me — the org behind the presented API key, plus the plan
 * limits the API enforces (`effectivePlan` folds in trial expiry; the
 * monthly quota counts non-failed reports since the UTC month start).
 */
export const GET = withAuth(async (_request, principal) => {
  const org = await getOrg(principal.orgId);
  if (!org) return apiError(404, "Organization not found.", "not_found");

  const plan = effectivePlan(org);
  const quota = reportQuota(plan);
  const usedThisMonth = await countReportsSince(org.id, startOfUtcMonth());

  return json({
    data: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      effectivePlan: plan,
      reportQuota: quota,
      reportsUsedThisMonth: usedThisMonth,
    },
  });
});
