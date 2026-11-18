/**
 * Run a Check My Idea report from the terminal.
 *
 *   npm run check:idea -- "Invoice reminders for freelance designers"
 *   npm run check:idea -- "..." --save [--email founder@example.com]
 *   npm run check:idea -- "..." --json
 *
 * Needs DEEPSEEK_API_KEY (or LLM_API_KEY/LLM_BASE_URL/LLM_MODEL). `--save`
 * also needs DATABASE_URL: the check is stored and its private link printed.
 */
import "dotenv/config";

import { pool } from "@/db";
import { renderCheckMarkdown } from "@/lib/check/render";
import { IdeaValidationError, runIdeaCheck } from "@/lib/check/run";
import { checkPath, createIdeaCheck, runStoredCheck } from "@/lib/check/store";
import { defaultChatJson, LlmError } from "@/lib/llm/client";
import { site } from "@/lib/site";

type Args = {
  idea: string;
  save: boolean;
  json: boolean;
  email: string | null;
};

function parseArgs(argv: string[]): Args {
  const words: string[] = [];
  let save = false;
  let json = false;
  let email: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--save") save = true;
    else if (arg === "--json") json = true;
    else if (arg === "--email") email = argv[++i] ?? null;
    else words.push(arg);
  }
  return { idea: words.join(" "), save, json, email };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.idea.trim()) {
    console.error(
      'Usage: npm run check:idea -- "your idea in one sentence" [--save] [--json]',
    );
    process.exitCode = 2;
    return;
  }

  const llm = defaultChatJson();
  const started = Date.now();
  console.error(
    `Checking: ${args.idea}\n(searching Hacker News + GitHub, then analysing…)`,
  );

  if (!args.save) {
    const result = await runIdeaCheck(args.idea, { llm });
    console.log(
      args.json ? JSON.stringify(result, null, 2) : renderCheckMarkdown(result),
    );
    console.error(`\nDone in ${Math.round((Date.now() - started) / 1000)}s.`);
    return;
  }

  const { id, token } = await createIdeaCheck({
    idea: args.idea.replace(/\s+/g, " ").trim(),
    email: args.email,
    origin: "cli",
  });
  const row = await runStoredCheck(id, { llm });
  if (!row || row.status !== "complete" || !row.markdown) {
    console.error(`Check ${id} failed: ${row?.error ?? "unknown error"}`);
    process.exitCode = 1;
    return;
  }
  console.log(args.json ? JSON.stringify(row.result, null, 2) : row.markdown);
  console.error(`\nDone in ${Math.round((Date.now() - started) / 1000)}s.`);
  console.error(`Private link: ${site.url}${checkPath(id, token)}`);
}

main()
  .catch((error: unknown) => {
    if (error instanceof IdeaValidationError || error instanceof LlmError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
