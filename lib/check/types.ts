/**
 * The shape of a finished "Check My Idea" report. Stored as JSON on
 * `idea_checks.result`, rendered by the report page and the markdown export.
 *
 * Everything here has been validated against the evidence we actually
 * fetched: quotes are verbatim substrings, links point at real items.
 */

import type { EvidenceSource } from "@/lib/evidence/types";

export type Verdict = "build" | "niche_down" | "skip" | "insufficient";

export type SignalKey = "demand" | "wtp" | "openness" | "ease";

export type SignalScore = {
  /** 0–10 integer. */
  score: number;
  /** One plain-language sentence on why. */
  reason: string;
};

export type CheckQuote = {
  quote: string;
  url: string;
  source: EvidenceSource;
  /** ISO date of the original post. */
  date: string;
  /** Why this quote matters (from the analysis). */
  why: string;
};

export type CheckCompetitor = {
  name: string;
  whatTheyDo: string;
  weakSpot: string;
  url: string | null;
};

export type CheckAngle = {
  title: string;
  why: string;
};

export type CheckSourceStat = {
  source: EvidenceSource;
  searches: number;
  itemsRead: number;
};

export type CheckResult = {
  version: 1;
  idea: string;
  /** The idea restated in one line, as the report title. */
  headline: string;
  verdict: Verdict;
  /** 0–100, computed by our formula (lib/check/score.ts) — not by the model. */
  score: number | null;
  summary: string;
  signals: Record<SignalKey, SignalScore> | null;
  proof: CheckQuote[];
  competitors: CheckCompetitor[];
  angles: CheckAngle[];
  test48h: string;
  limits: string;
  sources: CheckSourceStat[];
  generatedAt: string;
};
