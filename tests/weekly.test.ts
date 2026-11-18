import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Evidence, EvidenceResult } from "@/lib/evidence/types";
import type { ChatJson } from "@/lib/llm/client";
import {
  generateWeeklyIssue,
  issueSlug,
  NotEnoughMaterialError,
  selectWeeklyItems,
  signalFor,
  validateIssue,
  weeklySearches,
} from "@/lib/weekly/generate";
import { renderWeeklyMarkdown, weekRange } from "@/lib/weekly/render";

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
    createdAt: "2026-11-12T10:00:00Z",
    engagement: {},
    matchedQuery: '"I wish there was"',
    ...overrides,
  };
}

const EVIDENCE: Evidence[] = [
  ev(
    "1",
    "I wish there was a way to cache the touch. It is unusable for commit signing in a rebase-heavy workflow.",
  ),
  ev("2", "Nice weather in Berlin today."),
  ev(
    "3",
    "Ask HN: Stripe closed us after one invoice and never asked for evidence",
    { kind: "story", engagement: { points: 179, comments: 92 } },
  ),
  ev("4", "Want OnKey on Windows or Linux? Vote here", {
    source: "github",
    kind: "issue",
    id: "github:o/onkey/issues/1",
    url: "https://github.com/o/onkey/issues/1",
    engagement: { reactions: 48, comments: 3 },
  }),
  ev(
    "5",
    "So frustrating that there's no way to sync notes and reminders to my Windows desktop.",
  ),
];

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday

function labelOf(
  items: ReturnType<typeof selectWeeklyItems>,
  externalId: string,
): string {
  return items.find((i) => i.item.externalId === externalId)?.label ?? "";
}

function goodIssue(items: ReturnType<typeof selectWeeklyItems>) {
  return {
    title: "Stripe froze them, no appeal",
    intro: "Builders burned by platforms.",
    pains: [
      {
        title: "Payment processors freezing small businesses",
        pain: "Accounts closed without asking for evidence.",
        proof: [
          {
            evidenceId: labelOf(items, "3"),
            quote:
              "Stripe closed us after one invoice and never asked for evidence",
          },
        ],
        whoHasIt: "Small businesses",
        whatExists: "Nothing obvious",
        buildIdea: "Account health monitor",
        verdict: "niche_down",
        verdictReason: "Trust-heavy",
      },
      {
        title: "Touch ID for every commit",
        pain: "Secure Enclave keys need a tap per signature.",
        proof: [
          {
            evidenceId: labelOf(items, "1"),
            quote: "I wish there was a way to cache the touch.",
          },
        ],
        verdict: "build",
      },
      {
        title: "Mac tools wanted on Windows",
        proof: [
          {
            evidenceId: labelOf(items, "4"),
            quote: "Want OnKey on Windows or Linux? Vote here",
          },
        ],
        verdict: "build",
      },
      {
        title: "Invented quote",
        proof: [
          {
            evidenceId: labelOf(items, "5"),
            quote: "This was never said by anybody anywhere.",
          },
        ],
        verdict: "build",
      },
      {
        title: "Bad verdict",
        proof: [
          {
            evidenceId: labelOf(items, "5"),
            quote: "no way to sync notes and reminders to my Windows desktop",
          },
        ],
        verdict: "maybe",
      },
    ],
  };
}

describe("weekly generate", () => {
  test("slug is the Monday of the week (UTC)", () => {
    assert.equal(issueSlug(NOW), "2026-11-16");
    assert.equal(issueSlug(new Date("2026-11-16T00:00:00Z")), "2026-11-16");
    assert.equal(issueSlug(new Date("2026-11-22T23:59:59Z")), "2026-11-16");
  });

  test("searches cover pain phrases, Ask HN and GitHub requests", () => {
    const searches = weeklySearches();
    assert.ok(
      searches.filter((s) => s.source === "hackernews" && s.kind === "comment")
        .length >= 5,
    );
    assert.ok(
      searches.some((s) => s.source === "hackernews" && s.kind === "ask_hn"),
    );
    assert.ok(
      searches.some((s) => s.source === "github" && s.minReactions === 30),
    );
  });

  test("only pain comments, threads and issues reach the model, by engagement", () => {
    const items = selectWeeklyItems(EVIDENCE);
    assert.ok(!items.some((i) => i.item.externalId === "2"));
    assert.equal(items[0].item.externalId, "3");
    assert.deepEqual(
      items.map((i) => i.label),
      items.map((_, n) => `E${n + 1}`),
    );
  });

  test("validation keeps only pains with verified proof and a valid verdict", () => {
    const items = selectWeeklyItems(EVIDENCE);
    const issue = validateIssue(goodIssue(items), items);
    assert.deepEqual(
      issue.pains.map((p) => p.title),
      [
        "Payment processors freezing small businesses",
        "Touch ID for every commit",
        "Mac tools wanted on Windows",
      ],
    );
    assert.equal(issue.pains[0].signal, "179 points · 92 comments");
    assert.equal(issue.pains[2].signal, "48 👍 · 3 comments");
  });

  test("the same source can't back two pains", () => {
    const items = selectWeeklyItems(EVIDENCE);
    const raw = goodIssue(items);
    raw.pains[1].proof = raw.pains[0].proof;
    const issue = validateIssue(raw, items);
    assert.ok(
      !issue.pains.some((p) => p.title === "Touch ID for every commit"),
    );
  });

  test("signalFor picks the strongest cited item", () => {
    assert.equal(signalFor([]), "");
    assert.equal(
      signalFor([EVIDENCE[0], EVIDENCE[2]]),
      "179 points · 92 comments",
    );
  });

  test("end to end with fakes: slug, week start and stats", async () => {
    const llm: ChatJson = async ({ user }) => {
      const items = selectWeeklyItems(EVIDENCE);
      assert.ok(user.includes("[E1]"));
      return goodIssue(items);
    };
    const collect = async (): Promise<EvidenceResult> => ({
      evidence: EVIDENCE,
      errors: [],
    });
    const { slug, content } = await generateWeeklyIssue({
      llm,
      collect,
      now: () => NOW,
    });
    assert.equal(slug, "2026-11-16");
    assert.equal(content.weekStart, "2026-11-09");
    assert.equal(content.pains.length, 3);
    assert.deepEqual(content.stats, {
      itemsRead: 5,
      searches: weeklySearches().length,
    });
    assert.equal(weekRange(content), "Nov 9–Nov 15, 2026");
  });

  test("fewer than 3 verified pains → no draft", async () => {
    const llm: ChatJson = async () => ({ title: "x", pains: [] });
    const collect = async (): Promise<EvidenceResult> => ({
      evidence: EVIDENCE,
      errors: [],
    });
    await assert.rejects(
      generateWeeklyIssue({ llm, collect, now: () => NOW }),
      NotEnoughMaterialError,
    );
  });
});

describe("weekly render", () => {
  test("markdown has numbered pains, linked quotes, and the right CTA", async () => {
    const collect = async (): Promise<EvidenceResult> => ({
      evidence: EVIDENCE,
      errors: [],
    });
    const { content } = await generateWeeklyIssue({
      llm: async () => goodIssue(selectWeeklyItems(EVIDENCE)),
      collect,
      now: () => NOW,
    });
    const open = renderWeeklyMarkdown(content, {
      siteUrl: "https://painproof.co",
      checkOpen: true,
    });
    assert.match(open, /^# Stripe froze them, no appeal/);
    assert.match(open, /## 1\. Payment processors freezing small businesses/);
    assert.match(
      open,
      /\(\[Hacker News, 2026-11-12\]\(https:\/\/news\.ycombinator\.com\/item\?id=3\)\)/,
    );
    assert.match(open, /https:\/\/painproof\.co\/check/);
    const soon = renderWeeklyMarkdown(content, {
      siteUrl: "https://painproof.co",
      checkOpen: false,
    });
    assert.match(soon, /Reply with your idea/);
    assert.doesNotMatch(soon, /\/check/);
  });
});
