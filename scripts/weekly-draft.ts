/**
 * Draft this week's PainProof Weekly issue (run Mondays, e.g. from cron):
 *
 *   npm run weekly:draft
 *
 * Collects the past 7 days of public evidence, has the model pick 5–7 pains
 * with verified proof, saves a draft (never overwriting a published issue),
 * writes data/weekly/<slug>.md and emails it to WEEKLY_EDITOR_EMAIL.
 * Needs DATABASE_URL and an LLM key.
 */
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";

import { pool } from "@/db";
import { isCheckSaleOpen } from "@/lib/check/availability";
import { sendWeeklyDraftEmail } from "@/lib/email/weekly-draft";
import { defaultChatJson, LlmError } from "@/lib/llm/client";
import { site } from "@/lib/site";
import {
  generateWeeklyIssue,
  NotEnoughMaterialError,
} from "@/lib/weekly/generate";
import { renderWeeklyMarkdown } from "@/lib/weekly/render";
import { saveDraft } from "@/lib/weekly/store";

async function main() {
  const { slug, content } = await generateWeeklyIssue({
    llm: defaultChatJson(),
  });
  const markdown = renderWeeklyMarkdown(content, {
    siteUrl: site.url,
    checkOpen: isCheckSaleOpen(),
  });

  const { saved } = await saveDraft(slug, content, markdown);
  if (!saved) {
    console.error(
      `[weekly] ${slug} is already published — draft not overwritten.`,
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync("data/weekly", { recursive: true });
  const file = `data/weekly/${slug}.md`;
  writeFileSync(file, markdown);
  await sendWeeklyDraftEmail({
    slug,
    title: content.title,
    markdown,
    painCount: content.pains.length,
  });

  console.log(markdown);
  console.error(
    `\n[weekly] draft ${slug} saved (${content.pains.length} pains, ${content.stats.itemsRead} items read) → ${file}`,
  );
  console.error(`[weekly] publish with: npm run weekly:publish -- ${slug}`);
}

main()
  .catch((error: unknown) => {
    if (error instanceof NotEnoughMaterialError || error instanceof LlmError) {
      console.error(`[weekly] ${error.message}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
