/** Dependency-free request validation for the v1 API. */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Largest accepted JSON body; the v1 payloads are all tiny documents. */
const BODY_LIMIT_BYTES = 64 * 1024;

/** Reads a JSON request body, tolerating malformed/empty bodies. */
export async function parseJsonBody(
  request: Request,
): Promise<Parsed<unknown>> {
  // Refusing an oversized declared length keeps a single request from being
  // used as a memory amplifier.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_LIMIT_BYTES) {
    return { ok: false, error: "Request body is too large." };
  }

  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const API_KEY_NAME_MAX = 80;

export function parseApiKeyInput(body: unknown): Parsed<{ name: string }> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    return { ok: false, error: "`name` must be a non-empty string." };
  }
  return {
    ok: true,
    value: { name: record.name.trim().slice(0, API_KEY_NAME_MAX) },
  };
}

/**
 * `{ idea }` for POST /api/v1/checks. Length rules are enforced by
 * `normalizeIdea` so the API and the dashboard reject the same inputs.
 */
export function parseCheckInput(body: unknown): Parsed<{ idea: string }> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };
  if (typeof record.idea !== "string" || record.idea.trim().length === 0) {
    return { ok: false, error: "`idea` must be a non-empty string." };
  }
  return { ok: true, value: { idea: record.idea } };
}
