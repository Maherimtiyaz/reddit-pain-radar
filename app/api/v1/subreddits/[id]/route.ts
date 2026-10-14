import { removeSubreddit } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { isUuid } from "@/lib/api/validate";

/** DELETE /api/v1/subreddits/:id — stop tracking a subreddit. */
export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async (_request, principal, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id))
      return apiError(400, "Invalid subreddit id.", "invalid_id");

    const removed = await removeSubreddit(principal.orgId, id);
    if (!removed) return apiError(404, "Subreddit not found.", "not_found");

    return json({ data: { id, deleted: true } });
  },
);
