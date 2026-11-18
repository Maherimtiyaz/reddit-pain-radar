/**
 * Publish a reviewed weekly draft to the public /weekly archive:
 *
 *   npm run weekly:publish -- 2026-11-16
 *   npm run weekly:publish -- 2026-11-16 --drop 3,5   # remove pains 3 and 5 first
 */
import "dotenv/config";

import { pool } from "@/db";
import { isCheckSaleOpen } from "@/lib/check/availability";
import { site } from "@/lib/site";
import { renderWeeklyMarkdown } from "@/lib/weekly/render";
import { publishIssue } from "@/lib/weekly/store";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  const dropIndex = args.indexOf("--drop");
  const drop =
    dropIndex === -1
      ? []
      : (args[dropIndex + 1] ?? "")
          .split(",")
          .map((n) => Number.parseInt(n, 10))
          .filter((n) => Number.isInteger(n) && n > 0);

  if (!slug) {
    console.error("Usage: npm run weekly:publish -- YYYY-MM-DD [--drop 3,5]");
    process.exitCode = 2;
    return;
  }

  const issue = await publishIssue(slug, {
    drop,
    render: (content) =>
      renderWeeklyMarkdown(content, {
        siteUrl: site.url,
        checkOpen: isCheckSaleOpen(),
      }),
  });
  if (!issue) {
    console.error(`[weekly] no issue ${slug}. Run npm run weekly:draft first.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[weekly] published ${slug} (${issue.content.pains.length} pains) → ${site.url}/weekly/${slug}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
