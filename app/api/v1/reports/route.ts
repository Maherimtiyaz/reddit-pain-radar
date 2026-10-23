import { countReportsSince, getOrg, listReports } from "@/db/queries";
import {
  effectivePlan,
  reportQuota,
  startOfUtcMonth,
} from "@/lib/billing/limits";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { parseJsonBody, parseReportInput } from "@/lib/api/validate";
import { runReport } from "@/lib/reports/service";

/** GET /api/v1/reports — recent reports for the authenticated org. */
export const GET = withAuth(async (_request, principal) => {
  const reports = await listReports(principal.orgId);
  return json({ data: reports });
});

/** POST /api/v1/reports — generate a report from stored pain signals. */
export const POST = withAuth(async (request, principal) => {
  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");

  const parsed = parseReportInput(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  // Plan enforcement: quota is per calendar month (UTC); failed runs are
  // free. GET /api/v1/me exposes the same numbers for the customer.
  const org = await getOrg(principal.orgId);
  if (!org) return apiError(404, "Organization not found.", "not_found");

  const plan = effectivePlan(org);
  const quota = reportQuota(plan);
  const used = await countReportsSince(principal.orgId, startOfUtcMonth());
  if (used >= quota) {
    return plan === "expired_trial"
      ? apiError(
          402,
          "Your 14-day trial has ended. Subscribe to keep generating reports.",
          "trial_expired",
        )
      : apiError(
          402,
          `Monthly report limit reached for the ${org.plan} plan (${quota}/month). Upgrade or wait for the next reset.`,
          "plan_limit_reached",
        );
  }

  const result = await runReport(principal.orgId, parsed.value);
  if (!result.ok) return apiError(422, result.error, "report_failed");

  return json(
    {
      data: {
        id: result.reportId,
        status: "complete",
        signalCount: result.signalCount,
        themeCount: result.themeCount,
        reportsUsedThisMonth: used + 1,
        reportQuota: quota,
      },
    },
    { status: 201 },
  );
});
