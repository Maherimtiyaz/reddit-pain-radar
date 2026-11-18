import { after } from "next/server";

import { getOrg } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { parseCheckInput, parseJsonBody } from "@/lib/api/validate";
import { startProCheck } from "@/lib/check/pro";
import { runPaidCheck } from "@/lib/check/purchase";
import { listOrgChecks } from "@/lib/check/store";

/** POST runs the check after responding; research takes 1–3 minutes. */
export const maxDuration = 300;

const STATUS_FOR: Record<string, number> = {
  plan_required: 402,
  quota_reached: 402,
  invalid_idea: 400,
  unavailable: 503,
};

/** GET /api/v1/checks — the workspace's recent checks (newest first). */
export const GET = withAuth(async (_request, principal) => {
  const checks = await listOrgChecks(principal.orgId, 50);
  return json({ data: checks });
});

/**
 * POST /api/v1/checks — start a Check My Idea run (PainProof Pro quota).
 * Body: `{ "idea": "Who it's for and what it does" }`. Returns 202 with the
 * check id; poll GET /api/v1/checks/:id until `status` is complete/failed.
 */
export const POST = withAuth(async (request, principal) => {
  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");
  const parsed = parseCheckInput(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  const org = await getOrg(principal.orgId);
  if (!org) return apiError(404, "Organization not found.", "not_found");

  const started = await startProCheck({
    org,
    email: null,
    idea: parsed.value.idea,
  });
  if (!started.ok) {
    return apiError(
      STATUS_FOR[started.code] ?? 400,
      started.message,
      started.code,
    );
  }

  const { id, token } = started;
  after(async () => {
    try {
      await runPaidCheck({ checkId: id, token });
    } catch (error) {
      console.error("[api] check run crashed", { checkId: id }, error);
    }
  });

  return json(
    {
      data: {
        id,
        status: "queued",
        checksUsedThisMonth: started.used,
        checkQuota: started.quota,
      },
    },
    { status: 202 },
  );
});
