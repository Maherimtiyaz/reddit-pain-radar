import { createApiKeyRecord, listApiKeys } from "@/db/queries";
import { withAuth } from "@/lib/api/handler";
import { apiError, json } from "@/lib/api/http";
import { parseApiKeyInput, parseJsonBody } from "@/lib/api/validate";
import { generateApiKey } from "@/lib/auth/api-key";

/** GET /api/v1/keys — API keys for the authenticated org (hashes never returned). */
export const GET = withAuth(async (_request, principal) => {
  const keys = await listApiKeys(principal.orgId);
  return json({ data: keys });
});

/**
 * POST /api/v1/keys — mint a new key.
 * The plaintext `key` is returned exactly once and never stored.
 */
export const POST = withAuth(async (request, principal) => {
  const body = await parseJsonBody(request);
  if (!body.ok) return apiError(400, body.error, "invalid_body");

  const parsed = parseApiKeyInput(body.value);
  if (!parsed.ok) return apiError(400, parsed.error, "invalid_body");

  const { key, keyHash } = generateApiKey();
  const record = await createApiKeyRecord(principal.orgId, {
    name: parsed.value.name,
    keyHash,
  });

  return json(
    {
      data: {
        id: record.id,
        name: record.name,
        key,
        createdAt: record.createdAt,
      },
    },
    { status: 201 },
  );
});
