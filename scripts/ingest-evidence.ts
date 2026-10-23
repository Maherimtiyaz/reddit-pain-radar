import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { db } from "@/db";
import { painSignals, rawPosts } from "@/db/schema";

/**
 * Imports worker-exported evidence (JSONL, one `rpr-evidence/v1` record per
 * line) into the app's global evidence tables:
 *
 *   npm run db:ingest -- data/evidence.jsonl
 *
 * Idempotent by design: posts upsert on the unique `reddit_id` (keeping the
 * row UUID that signals reference, refreshing mutable fields) and signals
 * no-op against the (post, theme, md5(quote)) dedupe index — so re-running
 * an import is always safe. Signals without a theme are skipped (the worker
 * marks non-pain-points with a null theme).
 */

const EVIDENCE_VERSION = 1;

type EvidenceSignal = {
  theme: string;
  verbatimQuote: string;
  urgencyScore: number | null;
  wtpScore: number | null;
  compositeScore: number | null;
  extractedAt: string | null;
};

type EvidencePost = {
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

type EvidenceRecord = {
  version: number;
  post: EvidencePost;
  signals: EvidenceSignal[];
};

function fail(line: number, message: string): never {
  console.error(`[ingest] line ${line}: ${message}`);
  process.exit(1);
}

function parseRecords(content: string): EvidenceRecord[] {
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
      fail(line, "invalid JSON");
    }

    const record = parsed as EvidenceRecord;
    if (record.version !== EVIDENCE_VERSION) {
      fail(
        line,
        `unsupported version ${String(record.version)} (expected ${EVIDENCE_VERSION})`,
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
      fail(
        line,
        "post is missing required fields (redditId, subreddit, title, createdUtc, url)",
      );
    }
    records.push(record);
  }

  return records;
}

async function main(): Promise<void> {
  const input = resolve(process.argv[2] ?? "data/evidence.jsonl");

  let content: string;
  try {
    content = readFileSync(input, "utf8");
  } catch {
    console.error(
      `[ingest] cannot read ${input}. Produce one with \`uv run radar export\` or pass a path.`,
    );
    process.exit(1);
  }

  const records = parseRecords(content);
  if (records.length === 0) {
    console.error("[ingest] no records found; nothing to do.");
    process.exit(1);
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
            extractedAt: signal.extractedAt ? new Date(signal.extractedAt) : new Date(),
          })),
        )
        .onConflictDoNothing()
        .returning({ id: painSignals.id });

      signalsAdded += inserted.length;
      signalsSkipped += signals.length - inserted.length;
    }
  });

  console.log(`[ingest] ${input}`);
  console.log(`  posts upserted  ${postsUpserted}`);
  console.log(`  signals added   ${signalsAdded}`);
  console.log(
    `  signals skipped ${signalsSkipped} (duplicates or missing theme)`,
  );
}

main().catch((error: unknown) => {
  console.error("[ingest] failed:", error);
  process.exit(1);
});
