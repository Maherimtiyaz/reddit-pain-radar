/**
 * Hacker News via the public Algolia search API (https://hn.algolia.com/api).
 * No key needed. Comments are where people describe pains; Show HN stories are
 * where competitors announce themselves.
 */

import { fetchJson, type FetchJsonOptions } from "@/lib/evidence/http";
import {
  asNumber,
  asString,
  htmlToText,
  isRecord,
  truncate,
} from "@/lib/evidence/text";
import type { Evidence } from "@/lib/evidence/types";

const API = "https://hn.algolia.com/api/v1";
const ITEM_URL = "https://news.ycombinator.com/item?id=";
const MAX_TEXT = 2_000;
const MAX_HITS = 100;

export type HackerNewsKind = "comment" | "story" | "show_hn" | "ask_hn";

export type HackerNewsSearch = {
  query: string;
  kind: HackerNewsKind;
  /** Only items newer than this many days. */
  sinceDays?: number;
  /** `relevance` (default) or newest first. */
  sort?: "relevance" | "date";
  /** Stories only: minimum points. */
  minPoints?: number;
  /** Stories only: minimum comment count. */
  minComments?: number;
  limit?: number;
};

/** Build the Algolia URL for a search. Exported for tests. */
export function hackerNewsSearchUrl(
  search: HackerNewsSearch,
  now: number = Date.now(),
): string {
  const params = new URLSearchParams({
    tags: search.kind,
    hitsPerPage: String(Math.min(Math.max(search.limit ?? 30, 1), MAX_HITS)),
  });
  if (search.query.trim()) params.set("query", search.query.trim());

  const filters: string[] = [];
  if (search.sinceDays && search.sinceDays > 0) {
    const since =
      Math.floor(now / 1000) - Math.floor(search.sinceDays * 86_400);
    filters.push(`created_at_i>${since}`);
  }
  if (search.kind !== "comment") {
    if (search.minPoints) filters.push(`points>=${search.minPoints}`);
    if (search.minComments) filters.push(`num_comments>=${search.minComments}`);
  }
  if (filters.length > 0) params.set("numericFilters", filters.join(","));

  const endpoint = search.sort === "date" ? "search_by_date" : "search";
  return `${API}/${endpoint}?${params.toString()}`;
}

/** Algolia response → Evidence[]. Skips hits that lack the fields we need. */
export function parseHackerNewsHits(
  body: unknown,
  search: Pick<HackerNewsSearch, "query" | "kind">,
): Evidence[] {
  if (!isRecord(body) || !Array.isArray(body.hits)) return [];

  const evidence: Evidence[] = [];
  for (const hit of body.hits) {
    if (!isRecord(hit)) continue;
    const objectId = asString(hit.objectID);
    const createdAt = asString(hit.created_at);
    if (!objectId || !/^\d+$/.test(objectId) || !createdAt) continue;

    const isComment = search.kind === "comment";
    const title = isComment ? asString(hit.story_title) : asString(hit.title);
    const text = isComment
      ? htmlToText(asString(hit.comment_text))
      : htmlToText(asString(hit.story_text)) || (title ?? "");
    if (!text) continue;

    evidence.push({
      id: `hackernews:${objectId}`,
      source: "hackernews",
      kind: isComment ? "comment" : "story",
      externalId: objectId,
      url: `${ITEM_URL}${objectId}`,
      title,
      text: truncate(text, MAX_TEXT),
      author: asString(hit.author),
      createdAt,
      engagement: {
        points: asNumber(hit.points),
        comments: asNumber(hit.num_comments),
      },
      matchedQuery: search.query,
    });
  }
  return evidence;
}

export async function searchHackerNews(
  search: HackerNewsSearch,
  options: FetchJsonOptions = {},
): Promise<Evidence[]> {
  const body = await fetchJson(hackerNewsSearchUrl(search), options);
  return parseHackerNewsHits(body, search);
}
