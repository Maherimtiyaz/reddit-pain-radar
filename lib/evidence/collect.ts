/**
 * Run a batch of source searches and merge the results.
 *
 * One failing source or query never sinks the batch: its error is recorded
 * and collection continues, so a report can still say what it *did* find.
 */

import {
  searchGitHubIssues,
  type GitHubIssueSearch,
} from "@/lib/evidence/github";
import {
  searchHackerNews,
  type HackerNewsSearch,
} from "@/lib/evidence/hackernews";
import type { FetchJsonOptions } from "@/lib/evidence/http";
import { extractPainQuotes, findPainMatches } from "@/lib/evidence/pain";
import type {
  Evidence,
  EvidenceError,
  EvidenceResult,
  EvidenceSource,
} from "@/lib/evidence/types";

export type SourceSearch =
  | ({ source: "hackernews" } & HackerNewsSearch)
  | ({ source: "github" } & GitHubIssueSearch);

/** GitHub's unauthenticated search limit is tight; HN is generous. */
const CONCURRENCY: Record<EvidenceSource, number> = {
  hackernews: 4,
  github: 2,
};

/** Map with at most `limit` promises in flight, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** First occurrence wins, so earlier (more specific) searches keep credit. */
export function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

type SearchOutcome = { evidence: Evidence[]; error: EvidenceError | null };

async function runSearch(
  search: SourceSearch,
  options: FetchJsonOptions,
): Promise<SearchOutcome> {
  try {
    const evidence =
      search.source === "hackernews"
        ? await searchHackerNews(search, options)
        : await searchGitHubIssues(search, options);
    return { evidence, error: null };
  } catch (error) {
    return {
      evidence: [],
      error: {
        source: search.source,
        query: search.query,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function collectEvidence(
  searches: SourceSearch[],
  options: FetchJsonOptions = {},
): Promise<EvidenceResult> {
  const bySource = (source: EvidenceSource) =>
    searches.filter((search) => search.source === source);

  const [hn, gh] = await Promise.all(
    (["hackernews", "github"] as const).map((source) =>
      mapWithConcurrency(bySource(source), CONCURRENCY[source], (search) =>
        runSearch(search, options),
      ),
    ),
  );

  // Re-assemble in the caller's order so dedupe credit is deterministic.
  const outcomes = new Map<SourceSearch, SearchOutcome>();
  bySource("hackernews").forEach((search, i) => outcomes.set(search, hn[i]));
  bySource("github").forEach((search, i) => outcomes.set(search, gh[i]));

  const evidence: Evidence[] = [];
  const errors: EvidenceError[] = [];
  for (const search of searches) {
    const outcome = outcomes.get(search);
    if (!outcome) continue;
    evidence.push(...outcome.evidence);
    if (outcome.error) errors.push(outcome.error);
  }
  return { evidence: dedupeEvidence(evidence), errors };
}

export type PainfulEvidence = Evidence & {
  /** Verbatim quotes around each pain phrase (never paraphrased). */
  quotes: string[];
  /** Whether a willingness-to-pay phrase appeared. */
  mentionsPaying: boolean;
};

/**
 * Keep only evidence whose text contains a pain phrase, with the verbatim
 * quotes around each match. Stories (competitor announcements) are kept as-is
 * by callers; this is for comments and issues.
 */
export function selectPainful(evidence: Evidence[]): PainfulEvidence[] {
  const painful: PainfulEvidence[] = [];
  for (const item of evidence) {
    const matches = findPainMatches(item.text);
    if (matches.length === 0) continue;
    painful.push({
      ...item,
      quotes: extractPainQuotes(item.text),
      mentionsPaying: matches.some((match) => match.kind === "wtp"),
    });
  }
  return painful;
}
