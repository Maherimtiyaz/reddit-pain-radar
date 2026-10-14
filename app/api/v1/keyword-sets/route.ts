import { createKeywordSet, listKeywordSets } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { parseJsonBody, parseKeywordSetInput } from "@/lib/api/validate";

/** GET /api/v1/keyword-sets — keyword sets for the authenticated org. */
export const GET = withAuth(async (_request, principal) => {
  const sets = await listKeywordSets(principal.orgId);
  return json({ data: sets });
});

/** POST /api/v1/keyword-sets — create a named set of keywords. */
export const POST = withAuth(async (request, principal) => {
  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");

  const parsed = parseKeywordSetInput(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  const created = await createKeywordSet(principal.orgId, parsed.value);
  return json({ data: created }, { status: 201 });
});
