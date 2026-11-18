/**
 * Niche-watch topics. Tenant reads/writes go through `withTenant` so Postgres
 * RLS applies; the weekly digest iterates every workspace and therefore uses
 * the privileged client (a documented system path).
 */

import { and, eq, inArray } from "drizzle-orm";

import { adminDb } from "@/db/admin";
import {
  memberships,
  orgs,
  users,
  watchTopics,
  type WatchTopic,
} from "@/db/schema";
import { withTenant } from "@/db/tenant";

export const MIN_TOPIC_LENGTH = 3;
export const MAX_TOPIC_LENGTH = 60;

/** Lowercase, strip punctuation/operators, collapse spaces. */
export function normalizeTopic(raw: string): string | null {
  const topic = raw
    .toLowerCase()
    .replace(/["'`:()\[\]{}<>|*#@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH)
    return null;
  return topic;
}

export function listWatchTopics(orgId: string): Promise<WatchTopic[]> {
  return withTenant(orgId, (tx) =>
    tx.select().from(watchTopics).orderBy(watchTopics.createdAt),
  );
}

/** Returns false when the topic already exists. */
export async function addWatchTopic(
  orgId: string,
  topic: string,
): Promise<boolean> {
  const rows = await withTenant(orgId, (tx) =>
    tx
      .insert(watchTopics)
      .values({ orgId, topic })
      .onConflictDoNothing()
      .returning({ id: watchTopics.id }),
  );
  return rows.length > 0;
}

export async function removeWatchTopic(
  orgId: string,
  id: string,
): Promise<void> {
  await withTenant(orgId, (tx) =>
    tx.delete(watchTopics).where(eq(watchTopics.id, id)),
  );
}

export type DigestTarget = {
  orgId: string;
  orgName: string;
  emails: string[];
  topics: WatchTopic[];
};

/** Every subscribed workspace with at least one topic, plus who to email. */
export async function listDigestTargets(): Promise<DigestTarget[]> {
  const subscribed = await adminDb
    .select({ id: orgs.id, name: orgs.name })
    .from(orgs)
    .where(inArray(orgs.plan, ["pro", "starter"]));
  if (subscribed.length === 0) return [];
  const orgIds = subscribed.map((org) => org.id);

  const [topics, members] = await Promise.all([
    adminDb
      .select()
      .from(watchTopics)
      .where(inArray(watchTopics.orgId, orgIds)),
    adminDb
      .select({ orgId: memberships.orgId, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          inArray(memberships.orgId, orgIds),
          inArray(memberships.role, ["owner", "admin"]),
        ),
      ),
  ]);

  return subscribed
    .map((org) => ({
      orgId: org.id,
      orgName: org.name,
      emails: members.filter((m) => m.orgId === org.id).map((m) => m.email),
      topics: topics.filter((t) => t.orgId === org.id),
    }))
    .filter((target) => target.topics.length > 0 && target.emails.length > 0);
}

export async function markTopicsSent(
  topicIds: string[],
  at: Date,
): Promise<void> {
  if (topicIds.length === 0) return;
  await adminDb
    .update(watchTopics)
    .set({ lastSentAt: at })
    .where(inArray(watchTopics.id, topicIds));
}
