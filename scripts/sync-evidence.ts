import "dotenv/config";

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { ingestEvidenceFile } from "@/scripts/lib/evidence";

/**
 * One-command evidence pipeline (cron-friendly):
 *
 *   npm run evidence:sync [-- --skip-fetch]     (PowerShell: EVIDENCE_SKIP_FETCH=1)
 *
 *   1. `radar fetch`   — Reddit -> worker DB (regex + DeepSeek extraction)
 *   2. `radar export`  — worker DB -> data/evidence.jsonl (rpr-evidence/v1)
 *   3. `db:ingest`     — JSONL -> app DB (idempotent upsert)
 *
 * Resilience: a failed fetch (missing Reddit creds, API hiccup) only warns —
 * already-staged evidence still flows. Export or ingest failures abort with a
 * non-zero exit so cron notices. Every stage is idempotent, so reruns are
 * always safe. Use `--skip-fetch` when ingestion is owned by another cadence
 * (e.g. the worker's own `radar schedule` for digest emails).
 */

const WORKER_DIR = resolve(process.cwd(), "reddit-pain-radar-worker");
const EVIDENCE_FILE = resolve(process.cwd(), "data/evidence.jsonl");

/**
 * Environment for the worker subprocess. The root `.env` (loaded for the
 * app-side ingest) carries the *app's* DATABASE_URL — it must not leak into
 * the worker, whose Settings would prefer it over its own `.env` and then
 * query the app schema (which shares table names but not columns).
 */
function workerEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  return env;
}

function runRadar(args: string[], label: string): boolean {
  const result = spawnSync("uv", ["run", "radar", ...args], {
    cwd: WORKER_DIR,
    stdio: "inherit",
    env: workerEnv(),
  });
  if (result.error) {
    console.error(`[sync] ${label} failed to start: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

async function main(): Promise<void> {
  const skipFetch =
    process.argv.includes("--skip-fetch") ||
    process.env.EVIDENCE_SKIP_FETCH === "1";

  if (!skipFetch && !runRadar(["fetch"], "fetch")) {
    console.warn(
      "[sync] fetch failed (Reddit creds configured?); exporting evidence already in the worker DB.",
    );
  }

  if (!runRadar(["export", "--out", EVIDENCE_FILE], "export")) {
    process.exit(1);
  }

  const stats = await ingestEvidenceFile(EVIDENCE_FILE);
  console.log(`[sync] ${EVIDENCE_FILE}`);
  console.log(`  posts upserted  ${stats.postsUpserted}`);
  console.log(`  signals added   ${stats.signalsAdded}`);
  console.log(
    `  signals skipped ${stats.signalsSkipped} (duplicates or missing theme)`,
  );
}

main().catch((error: unknown) => {
  console.error("[sync] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
