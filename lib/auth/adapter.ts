import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";

/**
 * Minimal Auth.js adapter over our Drizzle schema.
 *
 * We don't use `@auth/drizzle-adapter` because 1.11.x imports the runtime
 * `PgDatabase` export, which drizzle-orm v1 RC renamed to `PgAsyncDatabase`;
 * the package cannot even be bundled against this project's drizzle version.
 *
 * Only the methods Auth.js needs for email magic links + database sessions are
 * implemented. The remaining optional methods (OAuth account linking) are also
 * present so a future provider can be added without touching this file.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const asString = (value: unknown) => (typeof value === "string" ? value : null);
const asNumber = (value: unknown) => (typeof value === "number" ? value : null);

function toAdapterUser(row: typeof users.$inferSelect): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
  };
}

function toAdapterSession(row: typeof sessions.$inferSelect): AdapterSession {
  return {
    sessionToken: row.sessionToken,
    userId: row.userId,
    expires: row.expires,
  };
}

async function findUserById(id: string): Promise<AdapterUser | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toAdapterUser(row) : null;
}

export const authAdapter: Adapter = {
  async createUser(user) {
    const [row] = await db
      .insert(users)
      .values({
        email: normalizeEmail(user.email),
        // Ignore any id Auth.js may supply: the table generates a UUID default.
        emailVerified: user.emailVerified ?? null,
        name: user.name ?? null,
        image: user.image ?? null,
      })
      .returning();
    return toAdapterUser(row);
  },

  async getUser(id) {
    return findUserById(id);
  },

  async getUserByEmail(email) {
    // Case-insensitive so a Stripe-provisioned user (whose address may have
    // mixed casing) is reconciled with a later magic-link sign-in.
    const normalized = normalizeEmail(email);
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalized}`)
      .limit(1);
    return row ? toAdapterUser(row) : null;
  },

  async getUserByAccount({ provider, providerAccountId }) {
    const [row] = await db
      .select({ user: users })
      .from(accounts)
      .innerJoin(users, eq(accounts.userId, users.id))
      .where(
        and(
          eq(accounts.provider, provider),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);
    return row ? toAdapterUser(row.user) : null;
  },

  async updateUser(user) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (user.email !== undefined) updates.email = normalizeEmail(user.email);
    if (user.emailVerified !== undefined)
      updates.emailVerified = user.emailVerified;
    if (user.name !== undefined) updates.name = user.name;
    if (user.image !== undefined) updates.image = user.image;

    if (Object.keys(updates).length === 0) {
      const existing = await findUserById(user.id);
      if (!existing) throw new Error(`Unknown user ${user.id}`);
      return existing;
    }

    const [row] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();
    if (!row) throw new Error(`Unknown user ${user.id}`);
    return toAdapterUser(row);
  },

  async deleteUser(userId) {
    await db.delete(users).where(eq(users.id, userId));
  },

  async linkAccount(account) {
    await db.insert(accounts).values({
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: asString(account.refresh_token),
      access_token: asString(account.access_token),
      expires_at: asNumber(account.expires_at),
      token_type: asString(account.token_type),
      scope: asString(account.scope),
      id_token: asString(account.id_token),
      session_state: asString(account.session_state),
    });
  },

  async unlinkAccount({ provider, providerAccountId }) {
    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.provider, provider),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      );
  },

  async createSession(session) {
    const [row] = await db.insert(sessions).values(session).returning();
    return toAdapterSession(row);
  },

  async getSessionAndUser(sessionToken) {
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.sessionToken, sessionToken))
      .limit(1);
    if (!row) return null;

    return {
      session: toAdapterSession(row.session),
      user: toAdapterUser(row.user),
    };
  },

  async updateSession(session) {
    const updates: Partial<typeof sessions.$inferInsert> = {};
    if (session.userId !== undefined) updates.userId = session.userId;
    if (session.expires !== undefined) updates.expires = session.expires;

    if (Object.keys(updates).length === 0) return undefined;

    const [row] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.sessionToken, session.sessionToken))
      .returning();
    return row ? toAdapterSession(row) : null;
  },

  async deleteSession(sessionToken) {
    const [row] = await db
      .delete(sessions)
      .where(eq(sessions.sessionToken, sessionToken))
      .returning();
    return row ? toAdapterSession(row) : null;
  },

  async createVerificationToken(verificationToken) {
    const [row] = await db
      .insert(verificationTokens)
      .values(verificationToken)
      .returning();
    return row;
  },

  async useVerificationToken({ identifier, token }) {
    // Delete-and-return in one statement so a link can only be consumed once.
    const [row] = await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, token),
        ),
      )
      .returning();
    return row ?? null;
  },
};
