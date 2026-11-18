/** Render a CheckResult as markdown (email body, export, CLI output). Pure. */

import {
  SIGNAL_LABELS,
  SIGNAL_QUESTIONS,
  SIGNAL_WEIGHTS,
  VERDICT_LABELS,
} from "@/lib/check/score";
import type { CheckResult, SignalKey, Verdict } from "@/lib/check/types";

const VERDICT_EMOJI: Record<Verdict, string> = {
  build: "🟢",
  niche_down: "🟡",
  skip: "🔴",
  insufficient: "⚪",
};

const SOURCE_NAMES = { hackernews: "Hacker News", github: "GitHub" } as const;

/** Keep model-written text from breaking markdown tables/links. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

export function verdictLine(result: CheckResult): string {
  return `${VERDICT_EMOJI[result.verdict]} ${VERDICT_LABELS[result.verdict]}`;
}

export function renderCheckMarkdown(result: CheckResult): string {
  const lines: string[] = [];
  const sources = result.sources
    .filter((s) => s.searches > 0)
    .map(
      (s) =>
        `${SOURCE_NAMES[s.source]} (${s.searches} searches, ${s.itemsRead} items read)`,
    )
    .join(", ");

  lines.push(`# PainProof check: ${result.headline}`, "");
  lines.push(`**Idea:** ${result.idea}  `);
  lines.push(
    `**Date:** ${result.generatedAt.slice(0, 10)} · **Sources searched:** ${sources || "none"}`,
    "",
  );
  lines.push(`## Verdict: ${verdictLine(result)}`, "");
  if (result.score !== null)
    lines.push(`**PainProof Score: ${result.score}/100**`, "");
  if (result.summary) lines.push(result.summary, "");

  if (result.signals) {
    lines.push("## Scores", "", "| Signal | Score | Why |", "|---|---|---|");
    for (const key of Object.keys(SIGNAL_WEIGHTS) as SignalKey[]) {
      const signal = result.signals[key];
      lines.push(
        `| ${SIGNAL_LABELS[key]}: ${SIGNAL_QUESTIONS[key]} | ${signal.score}/10 | ${cell(signal.reason)} |`,
      );
    }
    lines.push(
      "",
      "Score = (Demand × 0.30 + Willingness to pay × 0.30 + Openness × 0.25 + Ease × 0.15) × 10. 75+ build · 55–74 niche down · below 55 skip.",
      "",
    );
  }

  if (result.proof.length > 0) {
    lines.push("## Proof: what real people said", "");
    for (const quote of result.proof) {
      lines.push(
        `> "${quote.quote}" ([${SOURCE_NAMES[quote.source]}, ${quote.date}](${quote.url}))`,
      );
      if (quote.why) lines.push(`>`, `> _${quote.why}_`);
      lines.push("");
    }
  }

  if (result.competitors.length > 0) {
    lines.push(
      "## Who already solves this",
      "",
      "| Competitor | What they do | Weak spot |",
      "|---|---|---|",
    );
    for (const c of result.competitors) {
      const name = c.url ? `[${cell(c.name)}](${c.url})` : cell(c.name);
      lines.push(`| ${name} | ${cell(c.whatTheyDo)} | ${cell(c.weakSpot)} |`);
    }
    lines.push("");
  }

  if (result.angles.length > 0) {
    lines.push("## Best angles for you", "");
    result.angles.forEach((angle, i) =>
      lines.push(`${i + 1}. **${angle.title}:** ${angle.why}`),
    );
    lines.push("");
  }

  if (result.test48h)
    lines.push("## Your 48-hour test", "", result.test48h, "");
  if (result.limits)
    lines.push("## Limits of this report", "", result.limits, "");
  lines.push("---", "", "_PainProof: problems worth building, with proof._");
  return lines.join("\n");
}
