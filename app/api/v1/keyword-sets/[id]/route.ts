import { removeKeywordSet, setKeywordSetKeywords } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import {
  isUuid,
  parseJsonBody,
  parseKeywordSetUpdate,
} from "@/lib/api/validate";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/v1/keyword-sets/:id — replace the set's keywords. */
export const PATCH = withAuth<Ctx>(async (request, principal, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id))
    return apiError(400, "Invalid keyword set id.", "invalid_id");

  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");

  const parsed = parseKeywordSetUpdate(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  const updated = await setKeywordSetKeywords(
    principal.orgId,
    id,
    parsed.value.keywords,
  );
  if (!updated) return apiError(404, "Keyword set not found.", "not_found");

  return json({ data: updated });
});

/** DELETE /api/v1/keyword-sets/:id — delete a keyword set. */
export const DELETE = withAuth<Ctx>(async (_request, principal, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id))
    return apiError(400, "Invalid keyword set id.", "invalid_id");

  const removed = await removeKeywordSet(principal.orgId, id);
  if (!removed) return apiError(404, "Keyword set not found.", "not_found");

  return json({ data: { id, deleted: true } });
});
