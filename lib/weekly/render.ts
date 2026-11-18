/** Render an issue as markdown — paste into Beehiiv/Kit, or read in the archive. */

import { VERDICT_LABELS } from "@/lib/check/score";
import type { WeeklyIssueContent, WeeklyVerdict } from "@/lib/weekly/types";

const VERDICT_EMOJI: Record<WeeklyVerdict, string> = {
  build: "🟢",
  niche_down: "🟡",
  skip: "🔴",
};
const SOURCE_NAMES = { hackernews: "Hacker News", github: "GitHub" } as const;

export function weekRange(content: WeeklyIssueContent): string {
  const start = new Date(`${content.weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return `${fmt(start, false)}–${fmt(end, true)}`;
}

export function renderWeeklyMarkdown(
  content: WeeklyIssueContent,
  options: { siteUrl: string; checkOpen: boolean },
): string {
  const lines: string[] = [];
  lines.push(`# ${content.title}`, "");
  lines.push(`_PainProof Weekly · ${weekRange(content)}_`, "");
  if (content.intro) lines.push(content.intro, "");

  content.pains.forEach((pain, index) => {
    lines.push(`## ${index + 1}. ${pain.title}`, "");
    if (pain.pain) lines.push(`**The pain:** ${pain.pain}`, "");
    lines.push(`**Proof:**${pain.signal ? ` ${pain.signal}` : ""}`, "");
    for (const quote of pain.proof) {
      lines.push(
        `> "${quote.quote}" ([${SOURCE_NAMES[quote.source]}, ${quote.date}](${quote.url}))`,
        "",
      );
    }
    if (pain.whoHasIt) lines.push(`**Who has it:** ${pain.whoHasIt}  `);
    if (pain.whatExists) lines.push(`**What exists:** ${pain.whatExists}  `);
    if (pain.buildIdea) lines.push(`**Build it as:** ${pain.buildIdea}  `);
    lines.push(
      `**PainProof:** ${VERDICT_EMOJI[pain.verdict]} ${VERDICT_LABELS[pain.verdict]}${pain.verdictReason ? ` — ${pain.verdictReason}` : ""}`,
      "",
    );
  });

  lines.push("---", "", "## Have an idea?", "");
  lines.push(
    options.checkOpen
      ? `Get it checked against real evidence — verdict, score, quotes and a 48-hour test — for $9: ${options.siteUrl}/check`
      : "Reply with your idea in one sentence. I'll pick one reader idea to check in next week's issue.",
    "",
  );
  lines.push(
    `_Made from ${content.stats.itemsRead} public posts across ${content.stats.searches} searches. Every quote is verbatim and links to its source. Past issues: ${options.siteUrl}/weekly_`,
  );
  return lines.join("\n");
}
