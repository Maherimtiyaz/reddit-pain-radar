import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { db } from "@/db";
import {
  addSubreddit,
  createApiKeyRecord,
  createKeywordSet,
  createOrgWithOwner,
  listSubreddits,
} from "@/db/queries";
import { painSignals, rawPosts } from "@/db/schema";
import { generateApiKey } from "@/lib/auth/api-key";

/**
 * Seeds the local harness with one tenant and enough evidence to generate a
 * report. Run against a fresh database (`npm run db:reset`); it is not
 * idempotent for the org itself.
 */

const SEED_KEY_PATH = ".seed/api-key";
const OWNER_EMAIL = "founder@redditpainradar.test";
const ORG_SLUG = "acme-indie-studio";
const SUBREDDITS = ["SaaS", "webdev", "startups"];

type SeedPost = {
  redditId: string;
  subreddit: string;
  title: string;
  body: string;
  score: number;
  numComments: number;
  url: string;
  signals: { theme: string; quote: string; urgency: number; wtp: number }[];
};

const POSTS: SeedPost[] = [
  {
    redditId: "seed001",
    subreddit: "SaaS",
    title: "Pricing is completely out of control",
    body: "Honestly, $99/seat is too expensive for a solo founder. I keep looking for something cheaper.",
    score: 184,
    numComments: 42,
    url: "https://reddit.com/r/SaaS/comments/seed001",
    signals: [
      {
        theme: "Affordable solo-founder pricing",
        quote: "$99/seat is too expensive for a solo founder",
        urgency: 82,
        wtp: 74,
      },
    ],
  },
  {
    redditId: "seed002",
    subreddit: "SaaS",
    title: "Looking for a cheaper alternative to the big incumbents",
    body: "I wish there was a self-hosted option. I would happily pay once instead of a subscription.",
    score: 131,
    numComments: 28,
    url: "https://reddit.com/r/SaaS/comments/seed002",
    signals: [
      {
        theme: "Self-hosted, one-time-purchase alternative",
        quote: "I wish there was a self-hosted option",
        urgency: 68,
        wtp: 88,
      },
      {
        theme: "Subscription fatigue",
        quote: "I would happily pay once instead of a subscription",
        urgency: 55,
        wtp: 80,
      },
    ],
  },
  {
    redditId: "seed003",
    subreddit: "webdev",
    title: "Onboarding took me three hours",
    body: "Setup is driving me insane. Why is there no CLI import for existing data?",
    score: 76,
    numComments: 15,
    url: "https://reddit.com/r/webdev/comments/seed003",
    signals: [
      {
        theme: "Missing CLI migration tooling",
        quote: "Why is there no CLI import for existing data?",
        urgency: 71,
        wtp: 46,
      },
    ],
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run \`npm run db:up\` and check .env.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  requireEnv("DATABASE_ADMIN_URL");

  // 1) Tenant — privileged path (RLS denies this without a tenant context).
  const { orgId, userId } = await createOrgWithOwner({
    email: OWNER_EMAIL,
    name: "Sam Founder",
    orgName: "Acme Indie Studio",
    slug: ORG_SLUG,
  });

  // 2) Tracking config — org-scoped writes go through withTenant.
  for (const name of SUBREDDITS) {
    await addSubreddit(orgId, name);
  }
  const keywordSet = await createKeywordSet(orgId, {
    name: "Pricing complaints",
    keywords: ["too expensive", "cancel", "pricing", "paywall"],
  });

  // 3) First API key — only the hash is stored.
  const { key, keyHash } = generateApiKey();
  await createApiKeyRecord(orgId, { name: "seed key", keyHash });

  // 4) Evidence — global tables, written through the untenanted client.
  let signalCount = 0;
  for (const post of POSTS) {
    const inserted = await db
      .insert(rawPosts)
      .values({
        subreddit: post.subreddit,
        redditId: post.redditId,
        title: post.title,
        body: post.body,
        author: "throwaway_seed",
        score: post.score,
        numComments: post.numComments,
        createdUtc: new Date(),
        url: post.url,
      })
      .onConflictDoNothing()
      .returning({ id: rawPosts.id });

    const rawPostId = inserted[0]?.id;
    if (!rawPostId) continue;

    await db.insert(painSignals).values(
      post.signals.map((signal) => ({
        rawPostId,
        theme: signal.theme,
        verbatimQuote: signal.quote,
        urgencyScore: signal.urgency,
        wtpScore: signal.wtp,
        compositeScore: Number(((signal.urgency + signal.wtp) / 2).toFixed(2)),
      })),
    );
    signalCount += post.signals.length;
  }

  // 5) Sanity: the non-owner app role can read its own tenant via RLS.
  const visible = await listSubreddits(orgId);

  mkdirSync(dirname(SEED_KEY_PATH), { recursive: true });
  writeFileSync(SEED_KEY_PATH, key, "utf8");

  console.log(`\nSeeded org   ${orgId} (slug: ${ORG_SLUG})`);
  console.log(`Seeded user  ${userId} (${OWNER_EMAIL})`);
  console.log(`Subreddits   ${visible.length} visible to the app role`);
  console.log(`Keyword set  ${keywordSet?.name ?? "(none)"}`);
  console.log(
    `Evidence     ${POSTS.length} posts, ${signalCount} pain signals`,
  );
  console.log(`\nAPI key (also written to ${SEED_KEY_PATH}):\n  ${key}\n`);
}

main().catch((error: unknown) => {
  console.error("[seed] failed:", error);
  process.exit(1);
});
