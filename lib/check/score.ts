/**
 * The PainProof Score. Computed here, never by the model, so the number is
 * reproducible from the four signals shown in the report.
 *
 *   score = (demand × 0.30 + wtp × 0.30 + openness × 0.25 + ease × 0.15) × 10
 *
 *   ≥ 75 → build · 55–74 → niche down · < 55 → skip
 */

import type { SignalKey, Verdict } from "@/lib/check/types";

export const SIGNAL_WEIGHTS: Record<SignalKey, number> = {
  demand: 0.3,
  wtp: 0.3,
  openness: 0.25,
  ease: 0.15,
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  demand: "Demand",
  wtp: "Willingness to pay",
  openness: "Competition openness",
  ease: "Ease of MVP",
};

export const SIGNAL_QUESTIONS: Record<SignalKey, string> = {
  demand: "Do many people feel this?",
  wtp: "Do they spend money on it?",
  openness: "Is there room? (10 = wide open)",
  ease: "Can one person build v1 in 2–4 weeks?",
};

export const BUILD_THRESHOLD = 75;
export const NICHE_THRESHOLD = 55;

export const VERDICT_LABELS: Record<Verdict, string> = {
  build: "Build it",
  niche_down: "Niche down",
  skip: "Skip",
  insufficient: "Not enough evidence",
};

/** Clamp to an integer 0–10; non-numbers become null. */
export function clampSignal(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(10, Math.max(0, Math.round(value)));
}

export function computeScore(signals: Record<SignalKey, number>): number {
  const total = (Object.keys(SIGNAL_WEIGHTS) as SignalKey[]).reduce(
    (sum, key) => sum + signals[key] * SIGNAL_WEIGHTS[key],
    0,
  );
  return Math.round(total * 10);
}

export function verdictFor(score: number): Exclude<Verdict, "insufficient"> {
  if (score >= BUILD_THRESHOLD) return "build";
  if (score >= NICHE_THRESHOLD) return "niche_down";
  return "skip";
}
