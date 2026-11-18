import { defineRelations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type Stripe from "stripe";

import type { CheckResult } from "@/lib/check/types";
import type { WeeklyIssueContent } from "@/lib/weekly/types";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["owner", "admin", "member"]);
export const planEnum = pgEnum("plan", ["trial", "starter", "pro"]);
export const weeklyIssueStatusEnum = pgEnum("weekly_issue_status", [
  "draft",
  "published",
]);
export const ideaCheckStatusEnum = pgEnum("idea_check_status", [
  "pending_payment",
  "queued",
  "running",
  "complete",
  "failed",
]);

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const now = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Row-level-security predicate for org-scoped tables: a row is visible /
 * writable only when its `org_id` matches the transaction-local
 * `app.current_org_id` setting (populated by `withTenant` in db/tenant.ts).
 */
const tenantPolicy = (column = "org_id") =>
  pgPolicy("tenant_isolation", {
    as: "permissive",
    for: "all",
    using: sql`${sql.raw(column)} = current_setting('app.current_org_id', true)::uuid`,
    withCheck: sql`${sql.raw(column)} = current_setting('app.current_org_id', true)::uuid`,
  });

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  name: text("name"),
  // The Auth.js Drizzle adapter reads/writes the JS key `image`. Keep the
  // existing physical column so this is a metadata change, not a data move.
  image: text("avatar_url"),
  createdAt: now(),
});

/* ------------------------------------------------------------------ */
/* Auth.js adapter tables (global, no RLS)                             */
/* ------------------------------------------------------------------ */

/**
 * Magic-link auth lives in these adapter-shaped tables. Like `users` they are
 * global and written by the app connection (never tenant-scoped). The JS keys
 * match Auth.js's account/session models (see `lib/auth/adapter.ts`, which maps
 * them explicitly to these snake_case columns).
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const orgs = pgTable.withRLS(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    plan: planEnum("plan").notNull().default("trial"),
    createdAt: now(),
  },
  () => [tenantPolicy("id")],
);

export const memberships = pgTable.withRLS(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.orgId] }),
    index("memberships_org_id_idx").on(t.orgId),
    tenantPolicy(),
  ],
);

/* ------------------------------------------------------------------ */
/* Tracking (org-scoped)                                               */
/* ------------------------------------------------------------------ */

/**
 * PainProof Pro "niche watch": topics a workspace follows. Each week the
 * digest emails new pain quotes matching them (scripts/watch-digest.ts).
 */
export const watchTopics = pgTable.withRLS(
  "watch_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    createdAt: now(),
    /** Last digest that covered this topic; only newer posts are sent. */
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  (t) => [
    unique("watch_topics_org_id_topic_key").on(t.orgId, t.topic),
    index("watch_topics_org_id_idx").on(t.orgId),
    tenantPolicy(),
  ],
);

/* ------------------------------------------------------------------ */
/* PainProof: Check My Idea (global — access by private link token)    */
/* ------------------------------------------------------------------ */

/**
 * One "Check My Idea" report. Not org-scoped: a buyer needs no account, and
 * the report is reached through a private link whose token is stored only as
 * a SHA-256 hash (`access_token_hash`), like API keys.
 *
 * `result` is the validated `CheckResult` (lib/check/types.ts); `markdown` is
 * the same report rendered for email/export.
 */
export const ideaChecks = pgTable(
  "idea_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idea: text("idea").notNull(),
    email: text("email"),
    status: ideaCheckStatusEnum("status").notNull().default("queued"),
    accessTokenHash: text("access_token_hash").notNull(),
    /** Where the check came from: `cli`, `checkout` (paid), `pro`. */
    origin: text("origin").notNull().default("cli"),
    /** Set for Pro checks: the workspace whose quota it used. */
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    score: integer("score"),
    verdict: text("verdict"),
    result: jsonb("result").$type<CheckResult>(),
    markdown: text("markdown"),
    error: text("error"),
    /** Set when the buyer is sent to Stripe; the webhook matches on it. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: now(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("idea_checks_status_idx").on(t.status),
    index("idea_checks_email_idx").on(t.email),
    index("idea_checks_org_id_created_at_idx").on(t.orgId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* PainProof Weekly (global — public once published)                   */
/* ------------------------------------------------------------------ */

/**
 * One newsletter issue. Generated as a `draft` every week (scripts/weekly-draft.ts),
 * reviewed by the editor, then `published` to the public /weekly archive.
 * Sending the email itself happens in the newsletter tool (Beehiiv/Kit).
 */
export const weeklyIssues = pgTable(
  "weekly_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL slug, the week's Monday: `2026-11-16`. */
    slug: text("slug").notNull().unique(),
    status: weeklyIssueStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    content: jsonb("content").$type<WeeklyIssueContent>().notNull(),
    markdown: text("markdown").notNull(),
    createdAt: now(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [index("weekly_issues_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ */
/* Marketing (global, intentionally NOT org-scoped)                    */
/* ------------------------------------------------------------------ */

/**
 * Early-access email capture from the landing page. Not tied to a tenant,
 * so it is a plain table (no RLS) written through `db`, not `withTenant`.
 */
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("landing"),
  createdAt: now(),
});

/* ------------------------------------------------------------------ */
/* Billing (global — Stripe webhook audit trail)                       */
/* ------------------------------------------------------------------ */

/**
 * Every Stripe webhook event we accepted, recorded after the handler
 * succeeded. The unique `stripe_event_id` makes Stripe's automatic
 * redeliveries visible (and auditable) even though each handler is
 * idempotent on its own. Global like `waitlist` — no RLS, written through
 * the privileged client.
 */
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Stripe.Event>(),
    createdAt: now(),
  },
  (t) => [index("stripe_events_type_idx").on(t.type)],
);

/* ------------------------------------------------------------------ */
/* Reports & API keys (org-scoped)                                     */
/* ------------------------------------------------------------------ */

export const apiKeys = pgTable.withRLS(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull().unique(),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("api_keys_org_id_idx").on(t.orgId), tenantPolicy()],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const relations = defineRelations(
  {
    users,
    orgs,
    memberships,
    apiKeys,
    ideaChecks,
    weeklyIssues,
    watchTopics,
  },
  (r) => ({
    users: {
      memberships: r.many.memberships(),
    },
    orgs: {
      memberships: r.many.memberships(),
      apiKeys: r.many.apiKeys(),
      watchTopics: r.many.watchTopics(),
    },
    memberships: {
      user: r.one.users({ from: r.memberships.userId, to: r.users.id }),
      org: r.one.orgs({ from: r.memberships.orgId, to: r.orgs.id }),
    },
    apiKeys: {
      org: r.one.orgs({ from: r.apiKeys.orgId, to: r.orgs.id }),
    },
    watchTopics: {
      org: r.one.orgs({ from: r.watchTopics.orgId, to: r.orgs.id }),
    },
  }),
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;
export type IdeaCheck = typeof ideaChecks.$inferSelect;
export type WeeklyIssue = typeof weeklyIssues.$inferSelect;
export type WatchTopic = typeof watchTopics.$inferSelect;
export type NewIdeaCheck = typeof ideaChecks.$inferInsert;
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
