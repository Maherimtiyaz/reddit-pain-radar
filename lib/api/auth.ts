import { findPrincipalByKeyHash, touchApiKey } from "@/db/queries";
import { hashApiKey, safeEqualHex } from "@/lib/auth/api-key";

export type ApiPrincipal = { orgId: string; keyId: string };

/**
 * Authenticates a request via `Authorization: Bearer <api-key>`.
 *
 * Only the SHA-256 hash is stored, so the key is hashed and looked up on the
 * privileged connection (the caller isn't a known tenant yet). The stored hash
 * is re-compared in constant time as defense in depth. Returns `null` for any
 * missing/malformed/unknown key.
 */
export async function authenticate(
  request: Request,
): Promise<ApiPrincipal | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;

  const presented = match[1];
  const hash = hashApiKey(presented);
  const stored = await findPrincipalByKeyHash(hash);
  if (!stored) return null;
  if (!safeEqualHex(stored.keyHash, hash)) return null;

  void touchApiKey(stored.keyId);
  return { orgId: stored.orgId, keyId: stored.keyId };
}
