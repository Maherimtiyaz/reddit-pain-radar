import { and, asc, desc, eq, sql } from "drizzle-orm";

import { adminDb } from "./admin";
import {
  apiKeys,
  memberships,
  orgs,
  users,
  type Membership,
  type Org,
} from "./schema";
import { withTenant } from "./tenant";

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
    // Match the magic-link adapter: normalize new addresses and compare
    // case-insensitively so an existing user is reused, not duplicated.
    const email = input.email.trim().toLowerCase();
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    let userId = existing[0]?.id;
    if (!userId) {
      const inserted = await tx
        .insert(users)
        .values({ email, name: input.name ?? null })
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
 * Resolves the org a signed-in user belongs to (their first membership).
 * Privileged: `memberships`/`orgs` are RLS-protected and a session only knows
 * the user id, not the tenant. Returns `null` for users without an org (e.g.
 * someone who signed in before subscribing).
 */
export async function findOrgForUser(
  userId: string,
): Promise<{ org: Org; role: Membership["role"] } | null> {
  const rows = await adminDb
    .select({ org: orgs, role: memberships.role })
    .from(memberships)
    .innerJoin(orgs, eq(memberships.orgId, orgs.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(orgs.createdAt))
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
