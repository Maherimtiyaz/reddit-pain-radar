import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  selectForPrompt,
  validateAssessment,
  verifyQuote,
  type PromptItem,
} from "@/lib/check/assess";
import {
  fallbackPlan,
  ideaKeywords,
  normalizeQuery,
  PLAN_SYSTEM_PROMPT,
  planSearches,
  validatePlan,
} from "@/lib/check/plan";
import { renderCheckMarkdown } from "@/lib/check/render";
import {
  IdeaValidationError,
  normalizeIdea,
  runIdeaCheck,
} from "@/lib/check/run";
import { clampSignal, computeScore, verdictFor } from "@/lib/check/score";
import type { Evidence, EvidenceResult } from "@/lib/evidence/types";
import {
  completionContent,
  createChatJson,
  LlmError,
  parseModelJson,
  type ChatJson,
} from "@/lib/llm/client";

const IDEA = "Recover failed Stripe payments for small SaaS founders";

function item(
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
    author: "someone",
    createdAt: "2026-01-25T10:00:00Z",
    engagement: {},
    matchedQuery: "failed payments",
    ...overrides,
  };
}

const EVIDENCE: Evidence[] = [
  item(
    "1",
    "Stripe's built-in dunning emails have a pretty low recovery rate (most customers ignore them). So frustrating.",
  ),
  item(
    "2",
    "Sometimes the majority of its entire churn is caused by unexplained failed card charges from Stripe.",
  ),
  item(
    "3",
    "I wish there was a tool that chased failed payments by SMS. I'd pay for that.",
  ),
  item("4", "Unrelated comment about keyboards."),
  item("5", "Show HN: Rekko – recover failed payments", {
    kind: "story",
    engagement: { points: 40 },
  }),
];

const GOOD_ASSESSMENT = {
  headline: "Failed-payment recovery for small SaaS",
  summary: "The pain is real but crowded.",
  relevantEvidenceIds: ["E1", "E2", "E3", "E99"],
  signals: {
    demand: { score: 8, reason: "Several founders describe it." },
    wtp: { score: 9.4, reason: "It is lost revenue." },
    openness: { score: 3, reason: "Crowded." },
    ease: { score: 6, reason: "Webhooks and email." },
  },
  proof: [
    {
      evidenceId: "E1",
      quote: "Stripe’s built-in dunning emails have a pretty low recovery rate",
      why: "Default tools fail.",
    },
    {
      evidenceId: "E2",
      quote:
        "the majority of its entire churn is caused by unexplained failed card charges",
      why: "Big share of churn.",
    },
    {
      evidenceId: "E3",
      quote: "This sentence was never written by anyone at all.",
      why: "Invented.",
    },
    { evidenceId: "E42", quote: "Unknown item", why: "Bad id." },
  ],
  competitors: [
    {
      name: "Rekko",
      evidenceId: "E5",
      whatTheyDo: "SMS recovery",
      weakSpot: "New",
    },
  ],
  angles: [{ title: "Pick a vertical", why: "Gyms." }],
  test48h: "Ask 10 gym owners.",
  limits: "HN only.",
  score: 99, // must be ignored: the score is ours
};

/** A fake model: answers the plan prompt and the assess prompt. */
function fakeLlm(
  assessment: unknown = GOOD_ASSESSMENT,
): ChatJson & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async ({ system }) => {
    if (system === PLAN_SYSTEM_PROMPT) {
      calls.push("plan");
      return {
        headline: "Failed payment recovery",
        painQueries: ["failed payments", "dunning emails"],
        competitorQueries: ["payment recovery"],
        githubQueries: ["dunning"],
      };
    }
    calls.push("assess");
    return assessment;
  }) as ChatJson & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const collectFrom =
  (evidence: Evidence[], errors: EvidenceResult["errors"] = []) =>
  async (): Promise<EvidenceResult> => ({ evidence, errors });

const fixedNow = () => new Date("2026-11-18T12:00:00Z");

describe("score", () => {
  test("matches the sample report (8, 9, 3, 6 → 68, niche down)", () => {
    const score = computeScore({ demand: 8, wtp: 9, openness: 3, ease: 6 });
    assert.equal(score, 68);
    assert.equal(verdictFor(score), "niche_down");
  });

  test("thresholds", () => {
    assert.equal(verdictFor(75), "build");
    assert.equal(verdictFor(74), "niche_down");
    assert.equal(verdictFor(55), "niche_down");
    assert.equal(verdictFor(54), "skip");
  });

  test("clampSignal rounds and bounds", () => {
    assert.equal(clampSignal(9.6), 10);
    assert.equal(clampSignal(-3), 0);
    assert.equal(clampSignal(42), 10);
    assert.equal(clampSignal("7"), null);
    assert.equal(clampSignal(Number.NaN), null);
  });
});

describe("plan", () => {
  test("normalizes queries and strips operators", () => {
    assert.equal(
      normalizeQuery('  "Failed:Payments"  (stripe) '),
      "failed payments stripe",
    );
  });

  test("validates model output and caps list sizes", () => {
    const plan = validatePlan(
      {
        headline: "Recovery",
        painQueries: ["a b", "A B", "c d", "e f", "g h", "i j", "k l", 42],
        competitorQueries: [],
        githubQueries: ["one two three four five six seven eight"],
      },
      IDEA,
    );
    assert.deepEqual(plan.painQueries, ["a b", "c d", "e f", "g h", "i j"]);
    assert.deepEqual(
      plan.competitorQueries,
      fallbackPlan(IDEA).competitorQueries,
    );
    assert.deepEqual(plan.githubQueries, fallbackPlan(IDEA).githubQueries);
  });

  test("junk model output falls back to keywords", () => {
    assert.deepEqual(validatePlan("nonsense", IDEA), fallbackPlan(IDEA));
    assert.deepEqual(ideaKeywords(IDEA).slice(0, 3), [
      "recover",
      "failed",
      "stripe",
    ]);
  });

  test("planSearches covers all three search types", () => {
    const searches = planSearches(fallbackPlan(IDEA));
    assert.ok(
      searches.some((s) => s.source === "hackernews" && s.kind === "comment"),
    );
    assert.ok(
      searches.some((s) => s.source === "hackernews" && s.kind === "show_hn"),
    );
    assert.ok(searches.some((s) => s.source === "github"));
  });
});

describe("verifyQuote", () => {
  const source =
    "Hello there.  Stripe's built-in dunning emails have a pretty low recovery rate (most customers ignore them).";

  test("accepts verbatim quotes despite curly quotes, case and spacing", () => {
    assert.equal(
      verifyQuote(
        "“stripe’s BUILT-IN dunning emails have a pretty low recovery rate…”",
        source,
      ),
      "Stripe's built-in dunning emails have a pretty low recovery rate",
    );
  });

  test("rejects paraphrases and tiny fragments", () => {
    assert.equal(
      verifyQuote("Stripe's dunning emails rarely recover money", source),
      null,
    );
    assert.equal(verifyQuote("Hello there.", source), null);
  });
});

describe("validateAssessment", () => {
  const items: PromptItem[] = selectForPrompt(EVIDENCE);

  test("labels pain items before stories", () => {
    assert.equal(items.at(-1)?.item.kind, "story");
    assert.equal(items.length, EVIDENCE.length);
  });

  test("drops invented quotes and unknown ids; clamps scores", () => {
    const labelOf = (id: string) =>
      items.find((p) => p.item.externalId === id)?.label;
    const raw = structuredClone(GOOD_ASSESSMENT);
    raw.relevantEvidenceIds = [
      labelOf("1"),
      labelOf("2"),
      labelOf("3"),
      "E99",
    ].filter((x): x is string => Boolean(x));
    raw.proof[0].evidenceId = labelOf("1") ?? "";
    raw.proof[1].evidenceId = labelOf("2") ?? "";
    raw.proof[2].evidenceId = labelOf("3") ?? "";
    raw.competitors[0].evidenceId = labelOf("5") ?? "";

    const assessment = validateAssessment(raw, items);
    assert.equal(assessment.relevantCount, 3);
    assert.equal(assessment.proof.length, 2);
    assert.ok(
      assessment.proof.every((q) =>
        q.url.startsWith("https://news.ycombinator.com/item?id="),
      ),
    );
    assert.equal(assessment.signals?.wtp.score, 9);
    assert.equal(
      assessment.competitors[0].url,
      "https://news.ycombinator.com/item?id=5",
    );
  });

  test("missing signals make the whole signal block null", () => {
    const assessment = validateAssessment(
      { signals: { demand: { score: 5 } } },
      items,
    );
    assert.equal(assessment.signals, null);
    assert.deepEqual(validateAssessment(null, items).proof, []);
  });
});

describe("runIdeaCheck", () => {
  test("rejects too-short and too-long ideas", () => {
    assert.throws(() => normalizeIdea("short"), IdeaValidationError);
    assert.throws(() => normalizeIdea("x".repeat(601)), IdeaValidationError);
    assert.equal(normalizeIdea(`  ${IDEA}\n `), IDEA);
  });

  test("scores with our formula, never the model's number", async () => {
    // Labels follow selectForPrompt's order; map the fixture onto them.
    const items = selectForPrompt(EVIDENCE);
    const labelOf = (id: string) =>
      items.find((p) => p.item.externalId === id)?.label ?? "";
    const assessment = structuredClone(GOOD_ASSESSMENT);
    assessment.relevantEvidenceIds = [labelOf("1"), labelOf("2"), labelOf("3")];
    assessment.proof[0].evidenceId = labelOf("1");
    assessment.proof[1].evidenceId = labelOf("2");

    const llm = fakeLlm(assessment);
    const result = await runIdeaCheck(IDEA, {
      llm,
      collect: collectFrom(EVIDENCE),
      now: fixedNow,
    });
    assert.deepEqual(llm.calls, ["plan", "assess"]);
    assert.equal(result.score, 68);
    assert.equal(result.verdict, "niche_down");
    assert.equal(result.proof.length, 2);
    assert.equal(result.generatedAt, "2026-11-18T12:00:00.000Z");
    assert.deepEqual(
      result.sources.map((s) => [s.source, s.searches, s.itemsRead]),
      [
        ["hackernews", 3, 5],
        ["github", 1, 0],
      ],
    );
  });

  test("thin evidence → 'insufficient' with no score", async () => {
    const assessment = {
      ...GOOD_ASSESSMENT,
      relevantEvidenceIds: ["E1"],
      proof: [],
    };
    const result = await runIdeaCheck(IDEA, {
      llm: fakeLlm(assessment),
      collect: collectFrom(EVIDENCE),
      now: fixedNow,
    });
    assert.equal(result.verdict, "insufficient");
    assert.equal(result.score, null);
  });

  test("no evidence at all skips the assessment call", async () => {
    const llm = fakeLlm();
    const result = await runIdeaCheck(IDEA, {
      llm,
      collect: collectFrom([]),
      now: fixedNow,
    });
    assert.deepEqual(llm.calls, ["plan"]);
    assert.equal(result.verdict, "insufficient");
  });

  test("throws when every source failed", async () => {
    await assert.rejects(
      runIdeaCheck(IDEA, {
        llm: fakeLlm(),
        collect: collectFrom(
          [],
          [{ source: "hackernews", query: "q", message: "HTTP 503" }],
        ),
      }),
      /Every evidence source failed/,
    );
  });

  test("a failing planner falls back instead of failing the check", async () => {
    const llm: ChatJson = async ({ system }) => {
      if (system === PLAN_SYSTEM_PROMPT) throw new Error("model down");
      return {};
    };
    const result = await runIdeaCheck(IDEA, {
      llm,
      collect: collectFrom(EVIDENCE),
      now: fixedNow,
    });
    assert.equal(result.verdict, "insufficient");
  });
});

describe("render", () => {
  test("markdown includes verdict, score, linked proof and escapes tables", async () => {
    const items = selectForPrompt(EVIDENCE);
    const labelOf = (id: string) =>
      items.find((p) => p.item.externalId === id)?.label ?? "";
    const assessment = structuredClone(GOOD_ASSESSMENT);
    assessment.relevantEvidenceIds = [labelOf("1"), labelOf("2"), labelOf("3")];
    assessment.proof[0].evidenceId = labelOf("1");
    assessment.proof[1].evidenceId = labelOf("2");
    assessment.signals.demand.reason = "Pipes | break tables";
    const result = await runIdeaCheck(IDEA, {
      llm: fakeLlm(assessment),
      collect: collectFrom(EVIDENCE),
      now: fixedNow,
    });
    const md = renderCheckMarkdown(result);
    assert.match(md, /## Verdict: 🟡 Niche down/);
    assert.match(md, /\*\*PainProof Score: 68\/100\*\*/);
    assert.match(
      md,
      /\(\[Hacker News, 2026-01-25\]\(https:\/\/news\.ycombinator\.com\/item\?id=1\)\)/,
    );
    assert.match(md, /Pipes \\\| break tables/);
  });
});

describe("llm client", () => {
  test("parses fenced and bare JSON", () => {
    assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseModelJson('{"a":2}'), { a: 2 });
    assert.throws(() => parseModelJson("not json"), LlmError);
    assert.throws(() => completionContent({ choices: [] }), LlmError);
  });

  test("sends a JSON-mode chat request and returns parsed content", async () => {
    let sent: {
      url: string;
      body: Record<string, unknown>;
      auth: string | null;
    } | null = null;
    const chat = createChatJson(
      {
        baseUrl: "https://llm.test/v1",
        model: "test-model",
        apiKey: "sk-test",
      },
      {
        sleep: async () => {},
        fetchImpl: async (input, init) => {
          sent = {
            url: String(input),
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
            auth: new Headers(init?.headers).get("authorization"),
          };
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"ok":true}' } }],
            }),
            { status: 200 },
          );
        },
      },
    );
    assert.deepEqual(await chat({ system: "s", user: "u" }), { ok: true });
    assert.ok(sent);
    const request = sent as {
      url: string;
      body: Record<string, unknown>;
      auth: string | null;
    };
    assert.equal(request.url, "https://llm.test/v1/chat/completions");
    assert.equal(request.auth, "Bearer sk-test");
    assert.equal(request.body.model, "test-model");
    assert.deepEqual(request.body.response_format, { type: "json_object" });
  });
});

describe("proof relevance", () => {
  test("proof citing an item not marked relevant is dropped", () => {
    const items = selectForPrompt(EVIDENCE);
    const labelOf = (id: string) =>
      items.find((p) => p.item.externalId === id)?.label ?? "";
    const assessment = validateAssessment(
      {
        relevantEvidenceIds: [labelOf("2")],
        proof: [
          {
            evidenceId: labelOf("1"),
            quote:
              "Stripe's built-in dunning emails have a pretty low recovery rate",
            why: "not marked relevant",
          },
          {
            evidenceId: labelOf("2"),
            quote:
              "the majority of its entire churn is caused by unexplained failed card charges",
            why: "relevant",
          },
        ],
      },
      items,
    );
    assert.deepEqual(
      assessment.proof.map((q) => q.why),
      ["relevant"],
    );
  });
});
