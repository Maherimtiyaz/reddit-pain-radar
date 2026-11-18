import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { eq } from "drizzle-orm";

import { adminPool } from "@/db/admin";
import { createApiKeyRecord, createOrgWithOwner } from "@/db/queries";
import { ideaChecks } from "@/db/schema";
import { db, pool } from "@/db";
import { generateApiKey } from "@/lib/auth/api-key";
import { renderCheckMarkdown } from "@/lib/check/render";
import { checkPath, createIdeaCheck } from "@/lib/check/store";
import type { CheckResult } from "@/lib/check/types";
import { addWatchTopic, listWatchTopics } from "@/lib/watch/store";

/**
 * Seeds the local harness with one PainProof Pro workspace: owner, API key,
 * a watched topic, and a finished sample check (the real sample report from
 * painproof/). Run against a fresh database (`npm run db:reset`); it is not
 * idempotent for the org itself.
 */

const SEED_KEY_PATH = ".seed/api-key";
const OWNER_EMAIL = "founder@painproof.test";
const ORG_SLUG = "acme-indie-studio";

const SAMPLE: CheckResult = {
  version: 1,
  idea: "Recover failed Stripe payments for small SaaS founders",
  headline: "Failed-payment recovery for small SaaS",
  verdict: "niche_down",
  score: 68,
  summary:
    "The pain is real, old and expensive, but the generic product is crowded: Stripe's own retries plus several dedicated tools. Build for a specific slice instead.",
  signals: {
    demand: {
      score: 8,
      reason: "Founders describe failed card payments as a big share of churn.",
    },
    wtp: {
      score: 9,
      reason: "It is directly lost revenue, so ROI is easy to show.",
    },
    openness: {
      score: 3,
      reason: "Stripe Smart Retries plus several dedicated tools since 2014.",
    },
    ease: {
      score: 6,
      reason: "Webhooks plus email/SMS is doable solo, with trust weight.",
    },
  },
  proof: [
    {
      quote:
        "Stripe's built-in dunning emails have a pretty low recovery rate (most customers ignore them).",
      url: "https://news.ycombinator.com/item?id=46752629",
      source: "hackernews",
      date: "2026-01-25",
      why: "Default recovery leaves money on the table.",
    },
    {
      quote:
        "sometimes the majority of its entire churn is caused by unexplained failed card charges from Stripe",
      url: "https://news.ycombinator.com/item?id=19425196",
      source: "hackernews",
      date: "2019-03-18",
      why: "Failed charges can dominate churn.",
    },
  ],
  competitors: [
    {
      name: "FlyCode (YC S22)",
      whatTheyDo: "Owns retries and communications end-to-end",
      weakSpot: "Aimed at larger merchants",
      url: "https://news.ycombinator.com/item?id=41998159",
    },
  ],
  angles: [
    {
      title: "Pick one vertical",
      why: "Gyms and studios don't know what dunning is and need it done for them.",
    },
  ],
  test48h:
    "Ask 10 gym owners how many members they lost to failed cards last year, and whether they'd pay $29/month to recover half.",
  limits:
    "Hacker News only; competitor details come from their own launch posts.",
  sources: [
    { source: "hackernews", searches: 6, itemsRead: 40 },
    { source: "github", searches: 0, itemsRead: 0 },
  ],
  generatedAt: "2026-11-17T12:00:00.000Z",
};

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

  // 1) Workspace on Pro — privileged path (RLS denies this without a tenant).
  const { orgId, userId } = await createOrgWithOwner({
    email: OWNER_EMAIL,
    name: "Sam Founder",
    orgName: "Acme Indie Studio",
    slug: ORG_SLUG,
    plan: "pro",
  });

  // 2) API key — only the hash is stored.
  const { key, keyHash } = generateApiKey();
  await createApiKeyRecord(orgId, { name: "seed key", keyHash });

  // 3) Niche watch — org-scoped, written through withTenant (RLS applies).
  await addWatchTopic(orgId, "invoice reminders");
  const topics = await listWatchTopics(orgId);

  // 4) A finished sample check, reachable from the dashboard and by link.
  const { id, token } = await createIdeaCheck({
    idea: SAMPLE.idea,
    email: OWNER_EMAIL,
    origin: "pro",
    orgId,
  });
  await db
    .update(ideaChecks)
    .set({
      status: "complete",
      result: SAMPLE,
      markdown: renderCheckMarkdown(SAMPLE),
      score: SAMPLE.score,
      verdict: SAMPLE.verdict,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(ideaChecks.id, id));

  mkdirSync(dirname(SEED_KEY_PATH), { recursive: true });
  writeFileSync(SEED_KEY_PATH, key, "utf8");

  console.log(`\nSeeded org   ${orgId} (slug: ${ORG_SLUG}, plan: pro)`);
  console.log(`Seeded user  ${userId} (${OWNER_EMAIL})`);
  console.log(`Watch topics ${topics.length} visible to the app role (RLS)`);
  console.log(`Sample check ${checkPath(id, token)}`);
  console.log(`\nAPI key (also written to ${SEED_KEY_PATH}):\n  ${key}\n`);
}

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([pool.end(), adminPool.end()]);
  });
