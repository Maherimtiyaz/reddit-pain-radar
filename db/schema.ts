import { defineRelations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const roleEnum = pgEnum("role", ["owner", "admin", "member"]);
export const planEnum = pgEnum("plan", ["trial", "starter", "pro"]);
export const reportStatusEnum = pgEnum("report_status", [
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

export type ReportJson = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: now(),
});

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

export const subreddits = pgTable.withRLS(
  "subreddits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: now(),
  },
  (t) => [
    unique("subreddits_org_id_name_key").on(t.orgId, t.name),
    index("subreddits_org_id_idx").on(t.orgId),
    tenantPolicy(),
  ],
);

export const keywordSets = pgTable.withRLS(
  "keyword_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keywords: jsonb("keywords")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: now(),
  },
  (t) => [index("keyword_sets_org_id_idx").on(t.orgId), tenantPolicy()],
);

/* ------------------------------------------------------------------ */
/* Evidence (global & immutable — intentionally NOT org-scoped)        */
/* ------------------------------------------------------------------ */

export const rawPosts = pgTable(
  "raw_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subreddit: text("subreddit").notNull(),
    redditId: text("reddit_id").notNull().unique(),
    title: text("title").notNull(),
    body: text("body"),
    author: text("author"),
    score: integer("score").notNull().default(0),
    numComments: integer("num_comments").notNull().default(0),
    createdUtc: timestamp("created_utc", { withTimezone: true }).notNull(),
    url: text("url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("raw_posts_subreddit_idx").on(t.subreddit),
    index("raw_posts_created_utc_idx").on(t.createdUtc),
  ],
);

export const painSignals = pgTable(
  "pain_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawPostId: uuid("raw_post_id")
      .notNull()
      .references(() => rawPosts.id, { onDelete: "cascade" }),
    theme: text("theme").notNull(),
    verbatimQuote: text("verbatim_quote").notNull(),
    urgencyScore: real("urgency_score"),
    wtpScore: real("wtp_score"),
    compositeScore: real("composite_score"),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pain_signals_raw_post_id_idx").on(t.rawPostId),
    // Idempotency: the extractor can be re-run over the same post. Dedupe on
    // (post, theme, quote); the quote is hashed so arbitrarily long text stays
    // within the btree index-tuple limit.
    uniqueIndex("pain_signals_dedupe_idx").on(
      t.rawPostId,
      t.theme,
      sql`md5(${t.verbatimQuote})`,
    ),
  ],
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
/* Reports & API keys (org-scoped)                                     */
/* ------------------------------------------------------------------ */

export const reports = pgTable.withRLS(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    subredditIds: uuid("subreddit_ids").array(),
    keywordSetId: uuid("keyword_set_id").references(() => keywordSets.id, {
      onDelete: "set null",
    }),
    status: reportStatusEnum("status").notNull().default("queued"),
    markdownContent: text("markdown_content"),
    jsonContent: jsonb("json_content").$type<ReportJson>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    index("reports_org_id_idx").on(t.orgId),
    index("reports_status_idx").on(t.status),
    tenantPolicy(),
  ],
);

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
    subreddits,
    keywordSets,
    rawPosts,
    painSignals,
    reports,
    apiKeys,
  },
  (r) => ({
    users: {
      memberships: r.many.memberships(),
    },
    orgs: {
      memberships: r.many.memberships(),
      subreddits: r.many.subreddits(),
      keywordSets: r.many.keywordSets(),
      reports: r.many.reports(),
      apiKeys: r.many.apiKeys(),
    },
    memberships: {
      user: r.one.users({ from: r.memberships.userId, to: r.users.id }),
      org: r.one.orgs({ from: r.memberships.orgId, to: r.orgs.id }),
    },
    subreddits: {
      org: r.one.orgs({ from: r.subreddits.orgId, to: r.orgs.id }),
    },
    keywordSets: {
      org: r.one.orgs({ from: r.keywordSets.orgId, to: r.orgs.id }),
    },
    rawPosts: {
      painSignals: r.many.painSignals(),
    },
    painSignals: {
      rawPost: r.one.rawPosts({
        from: r.painSignals.rawPostId,
        to: r.rawPosts.id,
      }),
    },
    reports: {
      org: r.one.orgs({ from: r.reports.orgId, to: r.orgs.id }),
      keywordSet: r.one.keywordSets({
        from: r.reports.keywordSetId,
        to: r.keywordSets.id,
      }),
    },
    apiKeys: {
      org: r.one.orgs({ from: r.apiKeys.orgId, to: r.orgs.id }),
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
export type Subreddit = typeof subreddits.$inferSelect;
export type NewSubreddit = typeof subreddits.$inferInsert;
export type KeywordSet = typeof keywordSets.$inferSelect;
export type NewKeywordSet = typeof keywordSets.$inferInsert;
export type RawPost = typeof rawPosts.$inferSelect;
export type NewRawPost = typeof rawPosts.$inferInsert;
export type PainSignal = typeof painSignals.$inferSelect;
export type NewPainSignal = typeof painSignals.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
