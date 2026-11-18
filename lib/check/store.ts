/**
 * Persistence for idea checks. `idea_checks` is a global table (no RLS):
 * access control is the private link token, stored only as a SHA-256 hash.
 */

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gte, ne } from "drizzle-orm";

import { db } from "@/db";
import { ideaChecks, type IdeaCheck } from "@/db/schema";
import { safeEqualHex } from "@/lib/auth/api-key";
import { renderCheckMarkdown } from "@/lib/check/render";
import { runIdeaCheck, type RunCheckDeps } from "@/lib/check/run";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashAccessToken(token) };
}

/** Path to a check's private report page. */
export function checkPath(id: string, token: string): string {
  return `/check/${id}?t=${encodeURIComponent(token)}`;
}

export type CreateCheckInput = {
  idea: string;
  email?: string | null;
  origin: "cli" | "checkout" | "pro";
  status?: "pending_payment" | "queued";
  /** Pro checks: the workspace whose monthly quota this uses. */
  orgId?: string | null;
};

/** Insert a check; returns its id and the plaintext token (shown once). */
export async function createIdeaCheck(
  input: CreateCheckInput,
): Promise<{ id: string; token: string }> {
  const { token, tokenHash } = generateAccessToken();
  const [row] = await db
    .insert(ideaChecks)
    .values({
      idea: input.idea,
      email: input.email?.trim().toLowerCase() || null,
      origin: input.origin,
      status: input.status ?? "queued",
      accessTokenHash: tokenHash,
      orgId: input.orgId ?? null,
    })
    .returning({ id: ideaChecks.id });
  return { id: row.id, token };
}

/** The check if `token` opens it; null for unknown ids or wrong tokens. */
export async function getIdeaCheckForViewer(
  id: string,
  token: string | null | undefined,
): Promise<IdeaCheck | null> {
  if (!UUID_RE.test(id) || !token || !TOKEN_RE.test(token)) return null;
  const row = await db.query.ideaChecks.findFirst({
    where: { id },
  });
  if (!row) return null;
  return safeEqualHex(row.accessTokenHash, hashAccessToken(token)) ? row : null;
}

/**
 * Run a queued check and store the outcome. Claims the row atomically
 * (`queued` → `running`) so a duplicate trigger never runs it twice.
 * Returns the final row, or null if another runner already claimed it.
 */
export async function runStoredCheck(
  id: string,
  deps: RunCheckDeps,
): Promise<IdeaCheck | null> {
  const [claimed] = await db
    .update(ideaChecks)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(and(eq(ideaChecks.id, id), eq(ideaChecks.status, "queued")))
    .returning();
  if (!claimed) return null;

  try {
    const result = await runIdeaCheck(claimed.idea, deps);
    const [done] = await db
      .update(ideaChecks)
      .set({
        status: "complete",
        result,
        markdown: renderCheckMarkdown(result),
        score: result.score,
        verdict: result.verdict,
        completedAt: new Date(),
      })
      .where(eq(ideaChecks.id, id))
      .returning();
    return done;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[check] ${id} failed: ${message}`);
    const [failed] = await db
      .update(ideaChecks)
      .set({
        status: "failed",
        error: message.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(ideaChecks.id, id))
      .returning();
    return failed;
  }
}

/* ------------------------------------------------------------------ */
/* Pro: a workspace's checks (app-layer scoped by org_id)              */
/* ------------------------------------------------------------------ */

/** Checks counted against the monthly quota: everything except failures. */
export async function countOrgChecksSince(
  orgId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: ideaChecks.id })
    .from(ideaChecks)
    .where(
      and(
        eq(ideaChecks.orgId, orgId),
        gte(ideaChecks.createdAt, since),
        ne(ideaChecks.status, "failed"),
      ),
    );
  return rows.length;
}

export type OrgCheckSummary = Pick<
  IdeaCheck,
  "id" | "idea" | "status" | "score" | "verdict" | "createdAt"
> & { headline: string | null };

export async function listOrgChecks(
  orgId: string,
  limit = 25,
): Promise<OrgCheckSummary[]> {
  const rows = await db
    .select({
      id: ideaChecks.id,
      idea: ideaChecks.idea,
      status: ideaChecks.status,
      score: ideaChecks.score,
      verdict: ideaChecks.verdict,
      createdAt: ideaChecks.createdAt,
      result: ideaChecks.result,
    })
    .from(ideaChecks)
    .where(eq(ideaChecks.orgId, orgId))
    .orderBy(desc(ideaChecks.createdAt))
    .limit(limit);
  return rows.map(({ result, ...row }) => ({
    ...row,
    headline: result?.headline ?? null,
  }));
}

/** One check, only if it belongs to the workspace. */
export async function getOrgCheck(
  orgId: string,
  id: string,
): Promise<IdeaCheck | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(ideaChecks)
    .where(and(eq(ideaChecks.id, id), eq(ideaChecks.orgId, orgId)))
    .limit(1);
  return row ?? null;
}
