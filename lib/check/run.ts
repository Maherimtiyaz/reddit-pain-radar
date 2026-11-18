/**
 * Run one "Check My Idea": plan → collect → select → assess → verify → score.
 *
 * Pure orchestration with injectable I/O (`llm`, `collect`, `now`) so the
 * whole pipeline is unit-testable without network or a model.
 */

import { assessEvidence, selectForPrompt } from "@/lib/check/assess";
import { planCheck, planSearches } from "@/lib/check/plan";
import { computeScore, verdictFor } from "@/lib/check/score";
import type {
  CheckResult,
  CheckSourceStat,
  SignalKey,
} from "@/lib/check/types";
import { collectEvidence, type SourceSearch } from "@/lib/evidence/collect";
import type { EvidenceResult, EvidenceSource } from "@/lib/evidence/types";
import type { ChatJson } from "@/lib/llm/client";

export const MIN_IDEA_LENGTH = 15;
export const MAX_IDEA_LENGTH = 600;

/** Below these, we say "not enough evidence" instead of guessing. */
export const MIN_RELEVANT_ITEMS = 3;
export const MIN_VERIFIED_QUOTES = 2;

export type RunCheckDeps = {
  llm: ChatJson;
  collect?: (searches: SourceSearch[]) => Promise<EvidenceResult>;
  now?: () => Date;
};

export class IdeaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeaValidationError";
  }
}

/** Trim, collapse whitespace and enforce length bounds. */
export function normalizeIdea(raw: string): string {
  const idea = raw.replace(/\s+/g, " ").trim();
  if (idea.length < MIN_IDEA_LENGTH) {
    throw new IdeaValidationError(
      `Describe the idea in at least ${MIN_IDEA_LENGTH} characters: who it's for and what it does.`,
    );
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    throw new IdeaValidationError(
      `Keep the idea under ${MAX_IDEA_LENGTH} characters — one or two sentences is ideal.`,
    );
  }
  return idea;
}

function sourceStats(
  searches: SourceSearch[],
  evidence: EvidenceResult["evidence"],
): CheckSourceStat[] {
  const sources: EvidenceSource[] = ["hackernews", "github"];
  return sources.map((source) => ({
    source,
    searches: searches.filter((search) => search.source === source).length,
    itemsRead: evidence.filter((item) => item.source === source).length,
  }));
}

const INSUFFICIENT_LIMITS =
  "Public conversations on Hacker News and GitHub barely mention this problem. That does not mean nobody has it — the people who do may talk elsewhere (industry forums, app store reviews, in person).";

export async function runIdeaCheck(
  rawIdea: string,
  deps: RunCheckDeps,
): Promise<CheckResult> {
  const idea = normalizeIdea(rawIdea);
  const now = deps.now ?? (() => new Date());
  const collect = deps.collect ?? ((searches) => collectEvidence(searches));

  const plan = await planCheck(idea, deps.llm);
  const searches = planSearches(plan);
  const { evidence, errors } = await collect(searches);
  if (evidence.length === 0 && errors.length > 0) {
    throw new Error(
      `Every evidence source failed: ${errors.map((e) => `${e.source}: ${e.message}`).join("; ")}`,
    );
  }

  const items = selectForPrompt(evidence);
  const base = {
    version: 1 as const,
    idea,
    sources: sourceStats(searches, evidence),
    generatedAt: now().toISOString(),
  };

  if (items.length === 0) {
    return {
      ...base,
      headline: plan.headline,
      verdict: "insufficient",
      score: null,
      summary:
        "We couldn't find public conversations about this problem on Hacker News or GitHub.",
      signals: null,
      proof: [],
      competitors: [],
      angles: [],
      test48h:
        "Find 10 people who should have this problem and ask how they handle it today. If none describe it unprompted, rethink the problem before building.",
      limits: INSUFFICIENT_LIMITS,
    };
  }

  const assessment = await assessEvidence(idea, items, deps.llm);
  const headline = assessment.headline ?? plan.headline;
  const enoughEvidence =
    assessment.signals !== null &&
    assessment.relevantCount >= MIN_RELEVANT_ITEMS &&
    assessment.proof.length >= MIN_VERIFIED_QUOTES;

  if (!enoughEvidence || !assessment.signals) {
    return {
      ...base,
      headline,
      verdict: "insufficient",
      score: null,
      summary:
        assessment.summary ||
        "There wasn't enough relevant, verifiable evidence to score this idea honestly.",
      signals: assessment.signals,
      proof: assessment.proof,
      competitors: assessment.competitors,
      angles: assessment.angles,
      test48h: assessment.test48h,
      limits: [assessment.limits, INSUFFICIENT_LIMITS]
        .filter(Boolean)
        .join(" "),
    };
  }

  const scores = Object.fromEntries(
    Object.entries(assessment.signals).map(([key, value]) => [
      key,
      value.score,
    ]),
  ) as Record<SignalKey, number>;
  const score = computeScore(scores);

  return {
    ...base,
    headline,
    verdict: verdictFor(score),
    score,
    summary: assessment.summary,
    signals: assessment.signals,
    proof: assessment.proof,
    competitors: assessment.competitors,
    angles: assessment.angles,
    test48h: assessment.test48h,
    limits:
      assessment.limits ||
      "Only Hacker News and GitHub were searched; both lean towards developers.",
  };
}
