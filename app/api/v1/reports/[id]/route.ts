import { getReport } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { isUuid } from "@/lib/api/validate";

/** GET /api/v1/reports/:id — one report, including its markdown + JSON. */
export const GET = withAuth<{ params: Promise<{ id: string }> }>(
  async (_request, principal, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return apiError(400, "Invalid report id.", "invalid_id");

    const report = await getReport(principal.orgId, id);
    if (!report) return apiError(404, "Report not found.", "not_found");

    return json({
      data: {
        id: report.id,
        status: report.status,
        subredditIds: report.subredditIds,
        keywordSetId: report.keywordSetId,
        generatedAt: report.generatedAt,
        createdAt: report.createdAt,
        markdown: report.markdownContent,
        json: report.jsonContent,
      },
    });
  },
);
