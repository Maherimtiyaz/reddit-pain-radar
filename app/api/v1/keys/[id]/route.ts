import { revokeApiKey } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { isUuid } from "@/lib/api/validate";

/** DELETE /api/v1/keys/:id — revoke an API key. */
export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async (_request, principal, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) return apiError(400, "Invalid key id.", "invalid_id");

    const revoked = await revokeApiKey(principal.orgId, id);
    if (!revoked) return apiError(404, "API key not found.", "not_found");

    return json({ data: { id, revoked: true } });
  },
);
