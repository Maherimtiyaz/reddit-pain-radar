/** Dependency-free request validation for the v1 API. */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Reads a JSON request body, tolerating malformed/empty bodies. */
export async function parseJsonBody(
  request: Request,
): Promise<Parsed<unknown>> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reddit subreddit names: 2–21 word characters, no `r/` prefix. */
const SUBREDDIT_RE = /^[A-Za-z0-9_]{2,21}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Normalizes a user-supplied subreddit name to its canonical form. */
export function normalizeSubredditName(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/?r\//i, "");
  if (!SUBREDDIT_RE.test(trimmed)) return null;
  return trimmed;
}

export type ReportInput = {
  subredditIds: string[] | null;
  keywordSetId: string | null;
  title?: string;
};

export function parseReportInput(body: unknown): Parsed<ReportInput> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };

  let subredditIds: string[] | null = null;
  if (record.subredditIds != null) {
    if (!Array.isArray(record.subredditIds)) {
      return { ok: false, error: "`subredditIds` must be an array of ids." };
    }
    const ids = record.subredditIds;
    if (!ids.every((id): id is string => typeof id === "string")) {
      return { ok: false, error: "`subredditIds` must contain only strings." };
    }
    if (ids.some((id) => !isUuid(id))) {
      return { ok: false, error: "`subredditIds` contains a malformed id." };
    }
    subredditIds = ids;
  }

  let keywordSetId: string | null = null;
  if (record.keywordSetId != null) {
    if (
      typeof record.keywordSetId !== "string" ||
      !isUuid(record.keywordSetId)
    ) {
      return { ok: false, error: "`keywordSetId` must be a valid id." };
    }
    keywordSetId = record.keywordSetId;
  }

  let title: string | undefined;
  if (record.title != null) {
    if (typeof record.title !== "string" || record.title.trim().length === 0) {
      return { ok: false, error: "`title` must be a non-empty string." };
    }
    title = record.title.trim().slice(0, 200);
  }

  return { ok: true, value: { subredditIds, keywordSetId, title } };
}

export function parseSubredditInput(body: unknown): Parsed<{ name: string }> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };
  if (typeof record.name !== "string") {
    return { ok: false, error: "`name` must be a string." };
  }
  const name = normalizeSubredditName(record.name);
  if (!name) {
    return {
      ok: false,
      error: "`name` must be a valid subreddit (2–21 letters, digits or `_`).",
    };
  }
  return { ok: true, value: { name } };
}

const API_KEY_NAME_MAX = 80;
const KEYWORD_MAX = 50;
const KEYWORD_LENGTH_MAX = 60;

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

/** Trimmed, de-duped, capped list of keywords — or `null` when malformed. */
function parseKeywords(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const keyword = item.trim();
    if (keyword.length === 0 || keyword.length > KEYWORD_LENGTH_MAX)
      return null;
    out.push(keyword);
  }
  return Array.from(new Set(out)).slice(0, KEYWORD_MAX);
}

export function parseKeywordSetInput(
  body: unknown,
): Parsed<{ name: string; keywords: string[] }> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    return { ok: false, error: "`name` must be a non-empty string." };
  }
  const keywords = parseKeywords(record.keywords);
  if (!keywords) {
    return {
      ok: false,
      error: "`keywords` must be an array of non-empty strings.",
    };
  }
  return {
    ok: true,
    value: { name: record.name.trim().slice(0, API_KEY_NAME_MAX), keywords },
  };
}

export function parseKeywordSetUpdate(
  body: unknown,
): Parsed<{ keywords: string[] }> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Body must be a JSON object." };
  const keywords = parseKeywords(record.keywords);
  if (!keywords) {
    return {
      ok: false,
      error: "`keywords` must be an array of non-empty strings.",
    };
  }
  return { ok: true, value: { keywords } };
}
