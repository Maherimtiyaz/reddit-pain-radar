/**
 * Live check of the evidence sources against the real APIs.
 *
 *   npm run evidence:smoke                      # default idea
 *   npm run evidence:smoke -- "invoice reminders for freelancers"
 *
 * Exits non-zero if a source errors or returns nothing, so it doubles as a
 * quick "are the sources reachable from this host?" check before deploys.
 */
import "dotenv/config";

import { collectEvidence, selectPainful } from "@/lib/evidence/collect";

const topic = process.argv.slice(2).join(" ").trim() || "failed payments";

async function main() {
  const started = Date.now();
  const { evidence, errors } = await collectEvidence([
    { source: "hackernews", query: topic, kind: "comment", limit: 30 },
    { source: "hackernews", query: topic, kind: "show_hn", limit: 10 },
    { source: "github", query: topic, limit: 10 },
  ]);
  const painful = selectPainful(evidence.filter((e) => e.kind !== "story"));

  const count = (source: string) =>
    evidence.filter((e) => e.source === source).length;
  console.log(`topic: "${topic}" (${Date.now() - started} ms)`);
  console.log(
    `evidence: ${evidence.length} (hackernews ${count("hackernews")}, github ${count("github")})`,
  );
  console.log(`with pain phrases: ${painful.length}`);
  for (const item of painful.slice(0, 5)) {
    console.log(
      `\n- ${item.url}${item.mentionsPaying ? "  [mentions paying]" : ""}`,
    );
    console.log(`  "${item.quotes[0]}"`);
  }

  for (const error of errors) {
    console.error(
      `\n[error] ${error.source} "${error.query}": ${error.message}`,
    );
  }
  const missing = (["hackernews", "github"] as const).filter(
    (s) => count(s) === 0,
  );
  if (errors.length > 0 || missing.length > 0) {
    if (missing.length > 0)
      console.error(`\nno results from: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
