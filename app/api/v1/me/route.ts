import { getOrg } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";

/** GET /api/v1/me — the org behind the presented API key. */
export const GET = withAuth(async (_request, principal) => {
  const org = await getOrg(principal.orgId);
  if (!org) return apiError(404, "Organization not found.", "not_found");

  return json({
    data: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
  });
});
