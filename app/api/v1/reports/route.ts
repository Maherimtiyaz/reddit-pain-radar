import { listReports } from "@/db/queries";
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

  const result = await runReport(principal.orgId, parsed.value);
  if (!result.ok) return apiError(422, result.error, "report_failed");

  return json(
    {
      data: {
        id: result.reportId,
        status: "complete",
        signalCount: result.signalCount,
        themeCount: result.themeCount,
      },
    },
    { status: 201 },
  );
});
