import { addSubreddit, listSubreddits } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { parseJsonBody, parseSubredditInput } from "@/lib/api/validate";

/** GET /api/v1/subreddits — subreddits tracked by the authenticated org. */
export const GET = withAuth(async (_request, principal) => {
  const subreddits = await listSubreddits(principal.orgId);
  return json({ data: subreddits });
});

/** POST /api/v1/subreddits — track a new subreddit. */
export const POST = withAuth(async (request, principal) => {
  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");

  const parsed = parseSubredditInput(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  const created = await addSubreddit(principal.orgId, parsed.value.name);
  if (!created) {
    return apiError(409, "That subreddit is already tracked.", "conflict");
  }

  return json({ data: created }, { status: 201 });
});
