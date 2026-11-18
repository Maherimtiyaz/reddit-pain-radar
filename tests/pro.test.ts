import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  checkQuota,
  hasProAccess,
  watchTopicLimit,
} from "@/lib/billing/limits";
import { welcomeText } from "@/lib/email/welcome";
import { watchDigestText } from "@/lib/email/watch-digest";
import type { Evidence } from "@/lib/evidence/types";
import { pickTopicPains, topicSearches } from "@/lib/watch/digest";
import { normalizeTopic } from "@/lib/watch/store";

function ev(
  id: string,
  text: string,
  overrides: Partial<Evidence> = {},
): Evidence {
  return {
    id: `hackernews:${id}`,
    source: "hackernews",
    kind: "comment",
    externalId: id,
    url: `https://news.ycombinator.com/item?id=${id}`,
    title: "Thread",
    text,
    author: "a",
    createdAt: "2026-11-15T10:00:00Z",
    engagement: {},
    matchedQuery: "invoice reminders",
    ...overrides,
  };
}

describe("plans", () => {
  test("Pro and legacy starter get checks and topics; inactive plans get none", () => {
    assert.equal(checkQuota("pro"), 30);
    assert.equal(checkQuota("starter"), 30);
    assert.equal(checkQuota("trial"), 0);
    assert.equal(checkQuota("expired_trial"), 0);
    assert.equal(watchTopicLimit("pro"), 5);
    assert.equal(watchTopicLimit("trial"), 0);
    assert.equal(hasProAccess("pro"), true);
    assert.equal(hasProAccess("expired_trial"), false);
  });
});

describe("watch topics", () => {
  test("normalizeTopic cleans and bounds input", () => {
    assert.equal(
      normalizeTopic('  "Invoice   Reminders" '),
      "invoice reminders",
    );
    assert.equal(normalizeTopic("ab"), null);
    assert.equal(normalizeTopic("x".repeat(61)), null);
  });

  test("searches cover HN comments and GitHub, bounded to 14 days", () => {
    const now = new Date("2026-11-18T00:00:00Z");
    const recent = topicSearches(
      "invoices",
      new Date("2026-11-11T00:00:00Z"),
      now,
    );
    assert.equal(recent.length, 2);
    assert.equal(recent[0].sinceDays, 7);
    const old = topicSearches(
      "invoices",
      new Date("2026-01-01T00:00:00Z"),
      now,
    );
    assert.equal(old[0].sinceDays, 14);
  });

  test("picks only fresh pains and popular issues, strongest first", () => {
    const since = new Date("2026-11-11T00:00:00Z");
    const pains = pickTopicPains(
      [
        ev("1", "I wish there was a tool that sent invoice reminders for me.", {
          engagement: { points: 3 },
        }),
        ev("2", "So frustrating chasing clients for payment every month.", {
          engagement: { points: 40 },
        }),
        ev("3", "Old complaint: I wish there was a reminder tool.", {
          createdAt: "2026-11-01T00:00:00Z",
        }),
        ev("4", "Nice weather.", {}),
        ev("5", "Add recurring invoice reminders", {
          source: "github",
          kind: "issue",
          title: "Add recurring invoice reminders",
          url: "https://github.com/a/b/issues/5",
          engagement: { reactions: 25 },
        }),
        ev("6", "Small request", {
          source: "github",
          kind: "issue",
          title: "Small request",
          url: "https://github.com/a/b/issues/6",
          engagement: { reactions: 2 },
        }),
      ],
      since,
    );
    assert.deepEqual(
      pains.map((p) => p.url),
      // 👍 count double: 25 reactions (50) outrank 40 points.
      [
        "https://github.com/a/b/issues/5",
        "https://news.ycombinator.com/item?id=2",
        "https://news.ycombinator.com/item?id=1",
      ],
    );
    assert.equal(pains[0].quote, "Add recurring invoice reminders");
    assert.equal(pains[0].engagement, "25 👍");
  });

  test("digest text lists quotes with links and handles empty topics", () => {
    const text = watchDigestText(
      [
        {
          topicId: "t1",
          topic: "invoice reminders",
          pains: [
            {
              quote: "So frustrating chasing clients.",
              url: "https://news.ycombinator.com/item?id=2",
              source: "hackernews",
              date: "2026-11-15",
              context: null,
              engagement: "40 points",
            },
          ],
        },
        { topicId: "t2", topic: "yoga booking", pains: [] },
      ],
      "https://painproof.co/dashboard",
    );
    assert.match(text, /## invoice reminders/);
    assert.match(text, /https:\/\/news\.ycombinator\.com\/item\?id=2/);
    assert.match(text, /## yoga booking\n\nNothing new this week\./);
  });
});

describe("welcome email", () => {
  test("points Pro customers to sign in, with the API key as a secondary note", () => {
    const text = welcomeText({
      to: "a@b.co",
      orgName: "Acme",
      apiKey: "rpr_secret",
    });
    assert.match(text, /Welcome to PainProof Pro, Acme!/);
    assert.match(text, /\/login/);
    assert.match(text, /30 idea checks/);
    assert.match(text, /rpr_secret/);
    assert.doesNotMatch(text, /subreddit/i);
  });
});
