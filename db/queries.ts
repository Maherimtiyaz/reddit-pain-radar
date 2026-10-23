import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type { ReportSignal } from "@/lib/reports/generate";

import { adminDb } from "./admin";
import { db } from "./index";
import {
  apiKeys,
  keywordSets,
  memberships,
  orgs,
  painSignals,
  rawPosts,
  reports,
  subreddits,
  users,
  type Org,
  type ReportJson,
} from "./schema";
import { withTenant } from "./tenant";

export type ReportStatus = "queued" | "running" | "complete" | "failed";

/* ------------------------------------------------------------------ */
/* Provisioning (privileged — RLS is bypassed intentionally)           */
/* ------------------------------------------------------------------ */

/**
 * Creates/or reuses a user, then creates their org and owner membership.
 * Runs on the privileged connection because RLS denies writes before
 * `app.current_org_id` exists.
 *
 * `stripeCustomerId` / `plan` are set by the Stripe checkout webhook so
 * subscription lifecycle events can find (and re-plan) the org later.
 */
export async function createOrgWithOwner(input: {
  email: string;
  name?: string | null;
  orgName: string;
  slug: string;
  stripeCustomerId?: string;
  plan?: "trial" | "starter" | "pro";
}): Promise<{ userId: string; orgId: string }> {
  return adminDb.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    let userId = existing[0]?.id;
    if (!userId) {
      const inserted = await tx
        .insert(users)
        .values({ email: input.email, name: input.name ?? null })
        .returning({ id: users.id });
      userId = inserted[0].id;
    }

    const insertedOrgs = await tx
      .insert(orgs)
      .values({
        name: input.orgName,
        slug: input.slug,
        stripeCustomerId: input.stripeCustomerId ?? null,
        plan: input.plan ?? "trial",
      })
      .returning({ id: orgs.id });

    const orgId = insertedOrgs[0].id;

    await tx
      .insert(memberships)
      .values({ userId, orgId, role: "owner" })
      .onConflictDoNothing();

    return { userId, orgId };
  });
}

/**
 * Resolves the org that owns a hashed API key. Privileged because `api_keys`
 * is RLS-protected and the caller is not yet authenticated as a tenant.
 * Returns `null` for unknown keys.
 */
export async function findPrincipalByKeyHash(
  keyHash: string,
): Promise<{ orgId: string; keyId: string; keyHash: string } | null> {
  const rows = await adminDb
    .select({
      keyId: apiKeys.id,
      orgId: apiKeys.orgId,
      keyHash: apiKeys.keyHash,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Finds the org behind a Stripe customer id. Privileged: used by the billing
 * webhook before any tenant context exists. Returns `null` for unknown ids.
 */
export async function findOrgByStripeCustomerId(
  stripeCustomerId: string,
): Promise<Org | null> {
  const rows = await adminDb
    .select()
    .from(orgs)
    .where(eq(orgs.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Absolute plan write driven by Stripe subscription lifecycle events.
 * Privileged: `orgs` is RLS-protected and billing runs outside a tenant.
 */
export async function setOrgPlan(
  orgId: string,
  plan: "trial" | "starter" | "pro",
): Promise<void> {
  await adminDb.update(orgs).set({ plan }).where(eq(orgs.id, orgId));
}

/** Best-effort usage stamp; failures must never break the request. */
export async function touchApiKey(keyId: string): Promise<void> {
  try {
    await adminDb
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyId));
  } catch (error) {
    console.warn("[api-keys] failed to stamp last_used_at", error);
  }
}

/* ------------------------------------------------------------------ */
/* Orgs                                                                */
/* ------------------------------------------------------------------ */

export function getOrg(orgId: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);
    return rows[0] ?? null;
  });
}

/* ------------------------------------------------------------------ */
/* Subreddits                                                          */
/* ------------------------------------------------------------------ */

export function listSubreddits(orgId: string) {
  return withTenant(orgId, async (tx) =>
    tx
      .select()
      .from(subreddits)
      .where(eq(subreddits.orgId, orgId))
      .orderBy(asc(subreddits.name)),
  );
}

export function listSubredditsByIds(orgId: string, ids: string[]) {
  return withTenant(orgId, async (tx) => {
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(subreddits)
      .where(and(eq(subreddits.orgId, orgId), inArray(subreddits.id, ids)));
  });
}

export function addSubreddit(orgId: string, name: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .insert(subreddits)
      .values({ orgId, name })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  });
}

export function removeSubreddit(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .delete(subreddits)
      .where(and(eq(subreddits.orgId, orgId), eq(subreddits.id, id)))
      .returning({ id: subreddits.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Keyword sets                                                        */
/* ------------------------------------------------------------------ */

export function listKeywordSets(orgId: string) {
  return withTenant(orgId, async (tx) =>
    tx
      .select()
      .from(keywordSets)
      .where(eq(keywordSets.orgId, orgId))
      .orderBy(asc(keywordSets.name)),
  );
}

/** Loads one keyword set, scoped to the org (returns `null` if not owned). */
export function getKeywordSet(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(keywordSets)
      .where(and(eq(keywordSets.orgId, orgId), eq(keywordSets.id, id)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export function createKeywordSet(
  orgId: string,
  input: { name: string; keywords: string[] },
) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .insert(keywordSets)
      .values({ orgId, name: input.name, keywords: input.keywords })
      .returning();
    return rows[0];
  });
}

export function setKeywordSetKeywords(
  orgId: string,
  id: string,
  keywords: string[],
) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .update(keywordSets)
      .set({ keywords })
      .where(and(eq(keywordSets.orgId, orgId), eq(keywordSets.id, id)))
      .returning();
    return rows[0] ?? null;
  });
}

export function removeKeywordSet(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .delete(keywordSets)
      .where(and(eq(keywordSets.orgId, orgId), eq(keywordSets.id, id)))
      .returning({ id: keywordSets.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

export function listApiKeys(orgId: string) {
  return withTenant(orgId, async (tx) =>
    tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.orgId, orgId))
      .orderBy(desc(apiKeys.createdAt)),
  );
}

export function createApiKeyRecord(
  orgId: string,
  input: { name: string; keyHash: string },
) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .insert(apiKeys)
      .values({ orgId, name: input.name, keyHash: input.keyHash })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });
    return rows[0];
  });
}

export function revokeApiKey(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .delete(apiKeys)
      .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id)))
      .returning({ id: apiKeys.id });
    return rows.length > 0;
  });
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const reportSummary = {
  id: reports.id,
  status: reports.status,
  subredditIds: reports.subredditIds,
  keywordSetId: reports.keywordSetId,
  generatedAt: reports.generatedAt,
  createdAt: reports.createdAt,
};

export function listReports(orgId: string, limit = 50) {
  return withTenant(orgId, async (tx) =>
    tx
      .select(reportSummary)
      .from(reports)
      .where(eq(reports.orgId, orgId))
      .orderBy(desc(reports.createdAt))
      .limit(limit),
  );
}

export function getReport(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.orgId, orgId), eq(reports.id, id)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export function createReport(
  orgId: string,
  input: {
    subredditIds: string[] | null;
    keywordSetId: string | null;
    status?: ReportStatus;
  },
) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .insert(reports)
      .values({
        orgId,
        subredditIds: input.subredditIds,
        keywordSetId: input.keywordSetId,
        status: input.status ?? "queued",
      })
      .returning({ id: reports.id });
    return rows[0];
  });
}

export function updateReport(
  orgId: string,
  id: string,
  patch: {
    status?: ReportStatus;
    markdownContent?: string | null;
    jsonContent?: ReportJson | null;
    generatedAt?: Date | null;
  },
) {
  return withTenant(orgId, async (tx) => {
    const rows = await tx
      .update(reports)
      .set(patch)
      .where(and(eq(reports.orgId, orgId), eq(reports.id, id)))
      .returning();
    return rows[0] ?? null;
  });
}

/* ------------------------------------------------------------------ */
/* Evidence (global, shared across tenants)                            */
/* ------------------------------------------------------------------ */

/** Escapes LIKE wildcards so a keyword matches literally, not as a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Loads scored signals for the given subreddit names, strongest first.
 *
 * When `keywords` is non-empty, a signal is kept only when its source post
 * (title or body) or its verbatim quote contains one of the keywords,
 * case-insensitively.
 */
export async function fetchSignalsForReport(options: {
  subreddits: string[];
  keywords?: string[];
  limit?: number;
}): Promise<ReportSignal[]> {
  const { subreddits, keywords = [], limit = 500 } = options;
  if (subreddits.length === 0) return [];

  const conditions = [inArray(rawPosts.subreddit, subreddits)];

  const patterns = keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .map((keyword) => `%${escapeLike(keyword)}%`);

  if (patterns.length > 0) {
    const keywordFilter = or(
      ...patterns.flatMap((pattern) => [
        ilike(rawPosts.title, pattern),
        ilike(rawPosts.body, pattern),
        ilike(painSignals.verbatimQuote, pattern),
      ]),
    );
    if (keywordFilter) conditions.push(keywordFilter);
  }

  const rows = await db
    .select({
      id: painSignals.id,
      theme: painSignals.theme,
      quote: painSignals.verbatimQuote,
      urgency: painSignals.urgencyScore,
      wtp: painSignals.wtpScore,
      composite: painSignals.compositeScore,
      subreddit: rawPosts.subreddit,
      url: rawPosts.url,
    })
    .from(painSignals)
    .innerJoin(rawPosts, eq(painSignals.rawPostId, rawPosts.id))
    .where(and(...conditions))
    .orderBy(desc(painSignals.compositeScore))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    theme: row.theme,
    verbatimQuote: row.quote,
    urgencyScore: row.urgency,
    wtpScore: row.wtp,
    compositeScore: row.composite,
    subreddit: row.subreddit,
    url: row.url,
  }));
}
