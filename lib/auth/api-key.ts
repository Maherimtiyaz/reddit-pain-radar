import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API-key utilities. Server-only (node:crypto).
 *
 * Keys are shown to the user exactly once at creation; only the SHA-256 hash
 * is persisted (`api_keys.key_hash`), so a database leak never exposes usable
 * keys. Lookup is by hash, which is what the unique index covers.
 */

const KEY_PREFIX = "rpr";
const KEY_BYTES = 32;

/** Deterministic, indexable digest of a presented key. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Mint a new key. Persist only `keyHash`; return `key` to the caller once. */
export function generateApiKey(): { key: string; keyHash: string } {
  const key = `${KEY_PREFIX}_${randomBytes(KEY_BYTES).toString("base64url")}`;
  return { key, keyHash: hashApiKey(key) };
}

/** Constant-time comparison of two hex digests (defense against timing leaks). */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
