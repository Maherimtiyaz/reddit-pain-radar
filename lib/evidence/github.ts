/**
 * GitHub issues via the REST search API. Feature requests sorted by 👍 are
 * the most *countable* demand signal we have.
 *
 * Unauthenticated search allows ~10 requests/minute; set `GITHUB_TOKEN`
 * (a fine-grained token with no permissions is enough) for ~30/minute.
 */

import {
  fetchJson,
  SourceHttpError,
  type FetchJsonOptions,
} from "@/lib/evidence/http";
import {
  asNumber,
  asString,
  collapseWhitespace,
  isRecord,
  truncate,
} from "@/lib/evidence/text";
import type { Evidence } from "@/lib/evidence/types";

const API = "https://api.github.com/search/issues";
const MAX_TEXT = 2_000;
const MAX_PER_PAGE = 100;

export type GitHubIssueSearch = {
  /** Free-text terms. Qualifiers (`word:value`) are stripped; we add our own. */
  query: string;
  sinceDays?: number;
  minReactions?: number;
  /** Restrict to issues with this label (e.g. "enhancement"). */
  label?: string;
  state?: "open" | "closed";
  sort?: "reactions" | "comments" | "created";
  limit?: number;
};

/** Drop `key:value` qualifiers from caller text so only ours apply. */
export function sanitizeGitHubTerms(query: string): string {
  return query
    .replace(/(?:^|\s)-?[a-z_]+:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Build the search URL. Exported for tests. */
export function gitHubSearchUrl(
  search: GitHubIssueSearch,
  now: number = Date.now(),
): string {
  const parts = [sanitizeGitHubTerms(search.query), "is:issue"];
  if (search.state) parts.push(`is:${search.state}`);
  if (search.label) parts.push(`label:"${search.label.replace(/"/g, "")}"`);
  if (search.minReactions) parts.push(`reactions:>=${search.minReactions}`);
  if (search.sinceDays && search.sinceDays > 0) {
    parts.push(`created:>${isoDate(now - search.sinceDays * 86_400_000)}`);
  }

  const sort =
    search.sort === "comments"
      ? "comments"
      : search.sort === "created"
        ? "created"
        : "reactions-+1";
  const params = new URLSearchParams({
    q: parts.filter(Boolean).join(" "),
    sort,
    order: "desc",
    per_page: String(Math.min(Math.max(search.limit ?? 20, 1), MAX_PER_PAGE)),
  });
  return `${API}?${params.toString()}`;
}

/** Search response → Evidence[]. Pull requests are excluded. */
export function parseGitHubIssues(
  body: unknown,
  search: Pick<GitHubIssueSearch, "query">,
): Evidence[] {
  if (!isRecord(body) || !Array.isArray(body.items)) return [];

  const evidence: Evidence[] = [];
  for (const item of body.items) {
    if (!isRecord(item) || item.pull_request !== undefined) continue;
    const url = asString(item.html_url);
    const title = asString(item.title);
    const createdAt = asString(item.created_at);
    if (
      !url ||
      !url.startsWith("https://github.com/") ||
      !title ||
      !createdAt
    ) {
      continue;
    }

    const body = collapseWhitespace(asString(item.body) ?? "");
    const reactions = isRecord(item.reactions)
      ? asNumber(item.reactions["+1"])
      : undefined;
    const externalId = url.replace("https://github.com/", "");

    evidence.push({
      id: `github:${externalId}`,
      source: "github",
      kind: "issue",
      externalId,
      url,
      title,
      text: truncate(body ? `${title}\n${body}` : title, MAX_TEXT),
      author: isRecord(item.user) ? asString(item.user.login) : null,
      createdAt,
      engagement: {
        comments: asNumber(item.comments),
        reactions,
      },
      matchedQuery: search.query,
    });
  }
  return evidence;
}

let warnedBadToken = false;

export async function searchGitHubIssues(
  search: GitHubIssueSearch,
  options: FetchJsonOptions = {},
): Promise<Evidence[]> {
  const url = gitHubSearchUrl(search);
  const token = process.env.GITHUB_TOKEN?.trim();
  const request = (withToken: boolean) =>
    fetchJson(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(withToken && token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  try {
    return parseGitHubIssues(await request(true), search);
  } catch (error) {
    // An expired or invalid token must not take the source down: public
    // search works without one, just with a lower rate limit.
    if (!(token && error instanceof SourceHttpError && error.status === 401)) {
      throw error;
    }
    if (!warnedBadToken) {
      warnedBadToken = true;
      console.warn(
        "[evidence] GITHUB_TOKEN rejected (401); searching unauthenticated",
      );
    }
    return parseGitHubIssues(await request(false), search);
  }
}
