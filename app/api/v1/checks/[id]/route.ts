import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { isUuid } from "@/lib/api/validate";
import { getOrgCheck } from "@/lib/check/store";

/** GET /api/v1/checks/:id — status, and when complete the report (JSON + markdown). */
export const GET = withAuth<{ params: Promise<{ id: string }> }>(
  async (_request, principal, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return apiError(400, "Invalid check id.", "invalid_id");

    const check = await getOrgCheck(principal.orgId, id);
    if (!check) return apiError(404, "Check not found.", "not_found");

    return json({
      data: {
        id: check.id,
        idea: check.idea,
        status: check.status,
        verdict: check.verdict,
        score: check.score,
        createdAt: check.createdAt,
        completedAt: check.completedAt,
        result: check.status === "complete" ? check.result : null,
        markdown: check.status === "complete" ? check.markdown : null,
      },
    });
  },
);
