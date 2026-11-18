import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  collectEvidence,
  dedupeEvidence,
  mapWithConcurrency,
  selectPainful,
} from "@/lib/evidence/collect";
import {
  gitHubSearchUrl,
  parseGitHubIssues,
  sanitizeGitHubTerms,
} from "@/lib/evidence/github";
import {
  hackerNewsSearchUrl,
  parseHackerNewsHits,
} from "@/lib/evidence/hackernews";
import { fetchJson, retryAfterMs, SourceHttpError } from "@/lib/evidence/http";
import {
  extractPainQuotes,
  extractQuote,
  findPainMatches,
  hasPainPhrase,
} from "@/lib/evidence/pain";
import { decodeEntities, htmlToText, truncate } from "@/lib/evidence/text";
import type { Evidence } from "@/lib/evidence/types";

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0); // 2026-11-18T12:00:00Z

const noSleep = async () => {};

function jsonResponse(body: unknown, status = 200, headers = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function evidence(id: string, text = "text"): Evidence {
  return {
    id,
    source: "hackernews",
    kind: "comment",
    externalId: id,
    url: `https://news.ycombinator.com/item?id=${id}`,
    title: null,
    text,
    author: null,
    createdAt: "2026-11-01T00:00:00Z",
    engagement: {},
    matchedQuery: "q",
  };
}

describe("text", () => {
  test("decodes named and numeric entities", () => {
    assert.equal(
      decodeEntities("it&#x27;s &quot;fine&quot; &amp; &#8212; ok"),
      'it\'s "fine" & — ok',
    );
    assert.equal(decodeEntities("&bogus; &#99999999;"), "&bogus; &#99999999;");
  });

  test("htmlToText keeps paragraph breaks as newlines", () => {
    assert.equal(
      htmlToText("First line.<p>Second <i>line</i> &gt; here."),
      "First line.\nSecond line > here.",
    );
    assert.equal(htmlToText(null), "");
  });

  test("truncate cuts on a word boundary with an ellipsis", () => {
    assert.equal(truncate("short", 10), "short");
    assert.equal(truncate("one two three four five", 12), "one two…");
  });
});

describe("pain detection", () => {
  test("finds pain and willingness-to-pay phrases", () => {
    const matches = findPainMatches(
      "I wish there was a tool for this. I'd happily pay $20 a month.",
    );
    assert.deepEqual(
      matches.map((m) => m.kind),
      ["pain", "wtp"],
    );
    assert.equal(hasPainPhrase("The weather is nice."), false);
  });

  test("is case-insensitive and reusable (no sticky regex state)", () => {
    assert.equal(hasPainPhrase("SO FRUSTRATING"), true);
    assert.equal(hasPainPhrase("so frustrating"), true);
  });

  test("extractQuote returns the surrounding sentences verbatim", () => {
    const text =
      "We run a gym. Payments fail every month. I wish there was a tool to chase them. It costs us a lot. Unrelated ending.";
    const quote = extractQuote(text, text.indexOf("I wish"));
    assert.equal(
      quote,
      "Payments fail every month. I wish there was a tool to chase them. It costs us a lot.",
    );
    assert.ok(text.includes(quote));
  });

  test("extractQuote windows an overlong sentence", () => {
    const text = `${"word ".repeat(200)}I wish there was a fix ${"more ".repeat(200)}`;
    const quote = extractQuote(text, text.indexOf("I wish"), 120);
    assert.ok(quote.length <= 120);
    assert.ok(quote.includes("I wish there was"));
  });

  test("extractPainQuotes de-duplicates overlapping quotes", () => {
    const quotes = extractPainQuotes(
      "So frustrating. I wish there was a better way.",
    );
    assert.equal(quotes.length, 1);
  });
});

describe("hacker news", () => {
  test("builds a comment search URL with a date filter", () => {
    const url = new URL(
      hackerNewsSearchUrl(
        {
          query: " failed payments ",
          kind: "comment",
          sinceDays: 7,
          limit: 500,
        },
        NOW,
      ),
    );
    assert.equal(url.pathname, "/api/v1/search");
    assert.equal(url.searchParams.get("query"), "failed payments");
    assert.equal(url.searchParams.get("tags"), "comment");
    assert.equal(url.searchParams.get("hitsPerPage"), "100");
    assert.equal(
      url.searchParams.get("numericFilters"),
      `created_at_i>${NOW / 1000 - 7 * 86_400}`,
    );
  });

  test("story searches use date sort and engagement filters", () => {
    const url = new URL(
      hackerNewsSearchUrl(
        { query: "", kind: "ask_hn", sort: "date", minComments: 15 },
        NOW,
      ),
    );
    assert.equal(url.pathname, "/api/v1/search_by_date");
    assert.equal(url.searchParams.get("query"), null);
    assert.equal(url.searchParams.get("numericFilters"), "num_comments>=15");
  });

  test("parses comments and skips malformed hits", () => {
    const body = {
      hits: [
        {
          objectID: "46752629",
          created_at: "2026-01-25T10:00:00Z",
          author: "rekko",
          story_title: "Rekko – Recover failed Stripe payments",
          comment_text:
            "I was tired of manually chasing customers.<p>It&#x27;s painful.",
          points: null,
        },
        { objectID: "not-a-number", created_at: "2026-01-01T00:00:00Z" },
        { objectID: "1", created_at: "2026-01-01T00:00:00Z", comment_text: "" },
        "garbage",
      ],
    };
    const [item, ...rest] = parseHackerNewsHits(body, {
      query: "failed payments",
      kind: "comment",
    });
    assert.equal(rest.length, 0);
    assert.equal(item.id, "hackernews:46752629");
    assert.equal(item.url, "https://news.ycombinator.com/item?id=46752629");
    assert.equal(item.title, "Rekko – Recover failed Stripe payments");
    assert.equal(
      item.text,
      "I was tired of manually chasing customers.\nIt's painful.",
    );
    assert.equal(item.engagement.points, undefined);
  });

  test("stories fall back to the title when there is no body", () => {
    const [story] = parseHackerNewsHits(
      {
        hits: [
          {
            objectID: "41998159",
            created_at: "2024-10-30T00:00:00Z",
            title: "Launch HN: FlyCode (YC S22)",
            points: 120,
            num_comments: 80,
          },
        ],
      },
      { query: "failed payments", kind: "show_hn" },
    );
    assert.equal(story.kind, "story");
    assert.equal(story.text, "Launch HN: FlyCode (YC S22)");
    assert.deepEqual(story.engagement, { points: 120, comments: 80 });
  });

  test("non-object bodies parse to nothing", () => {
    assert.deepEqual(
      parseHackerNewsHits(null, { query: "", kind: "comment" }),
      [],
    );
  });
});

describe("github", () => {
  test("strips caller qualifiers so only ours apply", () => {
    assert.equal(
      sanitizeGitHubTerms('dark mode repo:evil/x -label:bug "export csv"'),
      'dark mode "export csv"',
    );
  });

  test("builds an issue search URL sorted by thumbs-up", () => {
    const url = new URL(
      gitHubSearchUrl(
        {
          query: "export csv user:someone",
          label: "enhancement",
          minReactions: 30,
          sinceDays: 45,
          state: "open",
        },
        NOW,
      ),
    );
    assert.equal(
      url.searchParams.get("q"),
      'export csv is:issue is:open label:"enhancement" reactions:>=30 created:>2026-10-04',
    );
    assert.equal(url.searchParams.get("sort"), "reactions-+1");
  });

  test("parses issues, drops pull requests and foreign URLs", () => {
    const body = {
      items: [
        {
          html_url: "https://github.com/dsmurrell/onkey/issues/1",
          title: "Want OnKey on Windows or Linux? Vote here",
          body: "Add a 👍   if you want it.",
          created_at: "2026-11-01T00:00:00Z",
          comments: 12,
          user: { login: "dsmurrell" },
          reactions: { "+1": 48, total_count: 60 },
        },
        {
          html_url: "https://github.com/a/b/pull/2",
          title: "A PR",
          created_at: "2026-11-01T00:00:00Z",
          pull_request: {},
        },
        {
          html_url: "https://evil.example/a/b/issues/3",
          title: "Not GitHub",
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
    };
    const items = parseGitHubIssues(body, { query: "port to windows" });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "github:dsmurrell/onkey/issues/1");
    assert.equal(items[0].author, "dsmurrell");
    assert.equal(items[0].engagement.reactions, 48);
    assert.ok(
      items[0].text.startsWith("Want OnKey on Windows or Linux? Vote here\n"),
    );
  });
});

describe("http", () => {
  test("retries 429 then succeeds, honouring Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await fetchJson("https://example.test/x", {
      retries: 2,
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({}, 429, { "retry-after": "2" })
          : jsonResponse({ ok: true });
      },
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(waits, [2000]);
  });

  test("does not retry a 404", async () => {
    let calls = 0;
    await assert.rejects(
      fetchJson("https://example.test/x", {
        retries: 3,
        sleep: noSleep,
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse({}, 404);
        },
      }),
      (error: unknown) =>
        error instanceof SourceHttpError && error.status === 404,
    );
    assert.equal(calls, 1);
  });

  test("retries network errors and gives up with a SourceHttpError", async () => {
    let calls = 0;
    await assert.rejects(
      fetchJson("https://example.test/x", {
        retries: 1,
        sleep: noSleep,
        fetchImpl: async () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
      }),
      SourceHttpError,
    );
    assert.equal(calls, 2);
  });

  test("retryAfterMs is bounded", () => {
    assert.equal(retryAfterMs("3600", 0), 8000);
    assert.equal(retryAfterMs(null, 0), 500);
    assert.equal(retryAfterMs(null, 10), 8000);
  });
});

describe("collect", () => {
  test("mapWithConcurrency keeps order and respects the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 3, 2], 2, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, n));
      active -= 1;
      return n * 10;
    });
    assert.deepEqual(out, [50, 10, 30, 20]);
    assert.equal(peak, 2);
    assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), []);
  });

  test("dedupe keeps the first occurrence", () => {
    const first = { ...evidence("1"), matchedQuery: "first" };
    const second = { ...evidence("1"), matchedQuery: "second" };
    assert.deepEqual(
      dedupeEvidence([first, second, evidence("2")]).map((e) => e.matchedQuery),
      ["first", "q"],
    );
  });

  test("collects across sources and records failures without throwing", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("hn.algolia.com")) {
        return jsonResponse({
          hits: [
            {
              objectID: "10",
              created_at: "2026-11-10T00:00:00Z",
              comment_text: "I wish there was a tool for this.",
            },
          ],
        });
      }
      return jsonResponse({ message: "rate limited" }, 403);
    };
    const result = await collectEvidence(
      [
        { source: "hackernews", query: "a", kind: "comment" },
        { source: "hackernews", query: "b", kind: "comment" },
        { source: "github", query: "c" },
      ],
      { fetchImpl, sleep: noSleep, retries: 0 },
    );
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].matchedQuery, "a");
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].source, "github");
    assert.match(result.errors[0].message, /HTTP 403/);
  });

  test("selectPainful keeps only items with pain phrases", () => {
    const painful = selectPainful([
      evidence("1", "Nice weather today."),
      evidence(
        "2",
        "Our tool is too expensive. I wish there was a cheaper one.",
      ),
    ]);
    assert.equal(painful.length, 1);
    assert.equal(painful[0].id, "2");
    assert.equal(painful[0].mentionsPaying, true);
    assert.ok(painful[0].quotes.length >= 1);
  });
});

describe("github token fallback", () => {
  test("a rejected token falls back to unauthenticated search", async () => {
    const previous = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "expired-token";
    const { searchGitHubIssues } = await import("@/lib/evidence/github");
    const seenAuth: Array<string | null> = [];
    try {
      const items = await searchGitHubIssues(
        { query: "export csv" },
        {
          sleep: noSleep,
          retries: 0,
          fetchImpl: async (_input, init) => {
            const auth = new Headers(init?.headers).get("authorization");
            seenAuth.push(auth);
            return auth
              ? jsonResponse({ message: "Bad credentials" }, 401)
              : jsonResponse({ items: [] });
          },
        },
      );
      assert.deepEqual(items, []);
      assert.deepEqual(seenAuth, ["Bearer expired-token", null]);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous;
    }
  });
});
