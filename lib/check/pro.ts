/**
 * Start a Pro check for a workspace — shared by the dashboard action and
 * POST /api/v1/checks so quota, plan and validation rules are identical.
 * The caller schedules the run (`after(() => runPaidCheck(...))`).
 */

import type { Org } from "@/db/schema";
import {
  checkQuota,
  effectivePlan,
  hasProAccess,
  startOfUtcMonth,
} from "@/lib/billing/limits";
import { IdeaValidationError, normalizeIdea } from "@/lib/check/run";
import { countOrgChecksSince, createIdeaCheck } from "@/lib/check/store";
import { isLlmConfigured } from "@/lib/llm/client";

export type StartProCheckResult =
  | { ok: true; id: string; token: string; used: number; quota: number }
  | {
      ok: false;
      code: "plan_required" | "quota_reached" | "invalid_idea" | "unavailable";
      message: string;
    };

export async function startProCheck(input: {
  org: Pick<Org, "id" | "plan" | "createdAt">;
  email: string | null;
  idea: string;
}): Promise<StartProCheckResult> {
  const plan = effectivePlan(input.org);
  if (!hasProAccess(plan)) {
    return {
      ok: false,
      code: "plan_required",
      message: "Idea checks are part of PainProof Pro.",
    };
  }
  if (!isLlmConfigured()) {
    return {
      ok: false,
      code: "unavailable",
      message: "Checks are temporarily unavailable. Please try again later.",
    };
  }

  const quota = checkQuota(plan);
  const used = await countOrgChecksSince(input.org.id, startOfUtcMonth());
  if (used >= quota) {
    return {
      ok: false,
      code: "quota_reached",
      message: `You've used all ${quota} checks this month. They reset on the 1st (UTC).`,
    };
  }

  let idea: string;
  try {
    idea = normalizeIdea(input.idea);
  } catch (error) {
    if (error instanceof IdeaValidationError) {
      return { ok: false, code: "invalid_idea", message: error.message };
    }
    throw error;
  }

  const { id, token } = await createIdeaCheck({
    idea,
    email: input.email,
    origin: "pro",
    orgId: input.org.id,
    status: "queued",
  });
  return { ok: true, id, token, used: used + 1, quota };
}
