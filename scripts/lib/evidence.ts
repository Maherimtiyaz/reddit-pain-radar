import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { db } from "@/db";
import { painSignals, rawPosts } from "@/db/schema";

/**
 * Shared core for the worker -> app evidence seam (`rpr-evidence/v1` JSONL).
 * Used by the `db:ingest` CLI and the `evidence:sync` orchestrator.
 *
 * Idempotent by design: posts upsert on the unique `reddit_id` (keeping the
 * row UUID that signals reference, refreshing mutable fields) and signals
 * no-op against the (post, theme, md5(quote)) dedupe index — so re-running
 * an import is always safe. Signals without a theme are skipped (the worker
 * marks non-pain-points with a null theme).
 */

export const EVIDENCE_VERSION = 1;

export type EvidenceSignal = {
  theme: string;
  verbatimQuote: string;
  urgencyScore: number | null;
  wtpScore: number | null;
  compositeScore: number | null;
  extractedAt: string | null;
};

export type EvidencePost = {
  redditId: string;
  subreddit: string;
  title: string;
  body: string | null;
  author: string | null;
  score: number;
  numComments: number;
  createdUtc: string;
  url: string;
  fetchedAt: string | null;
};

export type EvidenceRecord = {
  version: number;
  post: EvidencePost;
  signals: EvidenceSignal[];
};

export type IngestStats = {
  file: string;
  postsUpserted: number;
  signalsAdded: number;
  signalsSkipped: number;
};

/** Parses `rpr-evidence/v1` JSONL; throws with a line number on bad input. */
export function parseEvidence(content: string): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    const line = index + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`line ${line}: invalid JSON`);
    }

    const record = parsed as EvidenceRecord;
    if (record.version !== EVIDENCE_VERSION) {
      throw new Error(
        `line ${line}: unsupported version ${String(record.version)} (expected ${EVIDENCE_VERSION})`,
      );
    }
    const post = record.post;
    if (
      !post?.redditId ||
      !post.subreddit ||
      !post.title ||
      !post.createdUtc ||
      typeof post.url !== "string"
    ) {
      throw new Error(
        `line ${line}: post is missing required fields (redditId, subreddit, title, createdUtc, url)`,
      );
    }
    records.push(record);
  }

  return records;
}

/** Reads a JSONL evidence file and upserts it into the app DB. */
export async function ingestEvidenceFile(input: string): Promise<IngestStats> {
  const file = resolve(input);

  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `cannot read ${file}. Produce one with \`uv run radar export\` or pass a path.`,
    );
  }

  const records = parseEvidence(content);
  if (records.length === 0) {
    throw new Error("no records found; nothing to import.");
  }

  let postsUpserted = 0;
  let signalsAdded = 0;
  let signalsSkipped = 0;

  await db.transaction(async (tx) => {
    for (const record of records) {
      const post = record.post;
      const fetchedAt = post.fetchedAt ? new Date(post.fetchedAt) : new Date();

      const [row] = await tx
        .insert(rawPosts)
        .values({
          subreddit: post.subreddit,
          redditId: post.redditId,
          title: post.title,
          body: post.body || null,
          author: post.author || null,
          score: post.score ?? 0,
          numComments: post.numComments ?? 0,
          createdUtc: new Date(post.createdUtc),
          url: post.url,
          fetchedAt,
        })
        .onConflictDoUpdate({
          // Refresh mutable fields but keep the row UUID stable — signals
          // reference it, and re-imports must not orphan them.
          target: rawPosts.redditId,
          set: {
            title: post.title,
            body: post.body || null,
            author: post.author || null,
            score: post.score ?? 0,
            numComments: post.numComments ?? 0,
            url: post.url,
            fetchedAt,
          },
        })
        .returning({ id: rawPosts.id });

      postsUpserted += 1;

      const allSignals = record.signals ?? [];
      const signals = allSignals.filter(
        (signal) =>
          typeof signal?.theme === "string" &&
          signal.theme.length > 0 &&
          typeof signal.verbatimQuote === "string",
      );
      signalsSkipped += allSignals.length - signals.length;
      if (signals.length === 0 || !row) continue;

      const inserted = await tx
        .insert(painSignals)
        .values(
          signals.map((signal) => ({
            rawPostId: row.id,
            theme: signal.theme,
            verbatimQuote: signal.verbatimQuote,
            urgencyScore: signal.urgencyScore ?? null,
            wtpScore: signal.wtpScore ?? null,
            compositeScore: signal.compositeScore ?? null,
            extractedAt: signal.extractedAt
              ? new Date(signal.extractedAt)
              : new Date(),
          })),
        )
        .onConflictDoNothing()
        .returning({ id: painSignals.id });

      signalsAdded += inserted.length;
      signalsSkipped += signals.length - inserted.length;
    }
  });

  return { file, postsUpserted, signalsAdded, signalsSkipped };
}
