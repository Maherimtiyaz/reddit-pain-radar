import "dotenv/config";

import { resolve } from "node:path";

import { ingestEvidenceFile } from "@/scripts/lib/evidence";

/**
 * Imports worker-exported evidence (JSONL, one `rpr-evidence/v1` record per
 * line) into the app's global evidence tables:
 *
 *   npm run db:ingest -- data/evidence.jsonl
 *
 * See `scripts/lib/evidence.ts` for the idempotency semantics.
 */

async function main(): Promise<void> {
  const stats = await ingestEvidenceFile(
    resolve(process.argv[2] ?? "data/evidence.jsonl"),
  );

  console.log(`[ingest] ${stats.file}`);
  console.log(`  posts upserted  ${stats.postsUpserted}`);
  console.log(`  signals added   ${stats.signalsAdded}`);
  console.log(
    `  signals skipped ${stats.signalsSkipped} (duplicates or missing theme)`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "[ingest] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
