/**
 * PainProof Weekly: one issue = 5–7 pains of the week, each with verified,
 * linked proof. Stored as JSON on `weekly_issues.items`.
 */

import type { CheckQuote, Verdict } from "@/lib/check/types";

export type WeeklyVerdict = Exclude<Verdict, "insufficient">;

export type WeeklyPain = {
  title: string;
  /** One sentence: the pain in plain words. */
  pain: string;
  /** Verbatim, verified quotes; each links to its source. */
  proof: CheckQuote[];
  /** Engagement that backs it up, e.g. "179 points, 92 comments". */
  signal: string;
  whoHasIt: string;
  whatExists: string;
  buildIdea: string;
  verdict: WeeklyVerdict;
  verdictReason: string;
};

export type WeeklyIssueContent = {
  version: 1;
  /** ISO date (Monday) of the week the evidence covers. */
  weekStart: string;
  title: string;
  intro: string;
  pains: WeeklyPain[];
  generatedAt: string;
  /** How much was read, for the "how we made this" footer. */
  stats: { itemsRead: number; searches: number };
};
