import {
  createReport,
  fetchSignalsForReport,
  getKeywordSet,
  listSubreddits,
  listSubredditsByIds,
  updateReport,
} from "@/db/queries";

import { generateReport } from "./generate";

export type RunReportInput = {
  subredditIds: string[] | null;
  keywordSetId: string | null;
  title?: string;
};

export type RunReportResult =
  | { ok: true; reportId: string; signalCount: number; themeCount: number }
  | { ok: false; error: string };

/**
 * Generates a report synchronously: resolves the org's selected subreddits,
 * loads the shared pain signals for them (optionally filtered by a keyword
 * set), ranks them into themes, and persists the markdown + JSON onto the
 * report row.
 *
 * Synchronous is fine at landing-page scale; when ingestion grows this is the
 * seam to move behind a queue (insert `queued`, let a worker finish it).
 */
export async function runReport(
  orgId: string,
  input: RunReportInput,
): Promise<RunReportResult> {
  const requestedIds = input.subredditIds ?? [];
  let selected: { id: string; name: string }[];

  if (requestedIds.length > 0) {
    // Reject ids the org does not own instead of silently dropping them (RLS
    // would hide them, producing a misleadingly empty report).
    const uniqueIds = Array.from(new Set(requestedIds));
    const owned = await listSubredditsByIds(orgId, uniqueIds);
    if (owned.length !== uniqueIds.length) {
      return {
        ok: false,
        error: "One or more subreddits were not found for this organization.",
      };
    }
    selected = owned.map((row) => ({ id: row.id, name: row.name }));
  } else {
    selected = (await listSubreddits(orgId)).map((row) => ({
      id: row.id,
      name: row.name,
    }));
  }

  if (selected.length === 0) {
    return {
      ok: false,
      error: "Add at least one subreddit before generating a report.",
    };
  }

  // An optional keyword set narrows the evidence to matching posts/quotes.
  let keywords: string[] = [];
  if (input.keywordSetId) {
    const keywordSet = await getKeywordSet(orgId, input.keywordSetId);
    if (!keywordSet) {
      return { ok: false, error: "Keyword set not found." };
    }
    keywords = keywordSet.keywords;
  }

  const created = await createReport(orgId, {
    subredditIds: selected.map((row) => row.id),
    keywordSetId: input.keywordSetId,
    status: "running",
  });

  try {
    const signals = await fetchSignalsForReport({
      subreddits: selected.map((row) => row.name),
      keywords,
    });
    const generated = generateReport(signals, {
      generatedAt: new Date().toISOString(),
      title: input.title,
    });

    await updateReport(orgId, created.id, {
      status: "complete",
      markdownContent: generated.markdown,
      jsonContent: generated,
      generatedAt: new Date(generated.generatedAt),
    });

    return {
      ok: true,
      reportId: created.id,
      signalCount: generated.signalCount,
      themeCount: generated.themeCount,
    };
  } catch (error) {
    console.error("[reports] generation failed", error);
    await updateReport(orgId, created.id, { status: "failed" });
    return { ok: false, error: "Report generation failed." };
  }
}
