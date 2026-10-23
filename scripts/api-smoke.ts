import "dotenv/config";

import { readFileSync } from "node:fs";

/**
 * End-to-end smoke test for the v1 API against a running server.
 *
 * Prereqs: `npm run db:reset` then a running server (`npm run dev`/`start`).
 * Start it with `BASE_URL=http://localhost:3100 npm run api:smoke` when the app
 * is not on the default port.
 */

const BASE_URL =
  process.env.SMOKE_BASE_URL ??
  process.env.BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;
const KEY_PATH = ".seed/api-key";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
    return;
  }
  failures.push(label);
  console.error(
    `  \u2717 ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`,
  );
}

function get(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

async function call(
  method: string,
  path: string,
  options: { key?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (options.key) headers.Authorization = `Bearer ${options.key}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function readSeedKey(): string {
  if (process.env.SEED_API_KEY) return process.env.SEED_API_KEY.trim();
  try {
    return readFileSync(KEY_PATH, "utf8").trim();
  } catch {
    console.error(
      `No API key: set SEED_API_KEY or run \`npm run db:seed\` (writes ${KEY_PATH}).`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const key = readSeedKey();
  console.log(`\nv1 API smoke test against ${BASE_URL}\n`);

  // -- auth -------------------------------------------------------------
  const badKey = await call("GET", "/api/v1/me", { key: "rpr_not_a_real_key" });
  check("bad key -> 401", badKey.status === 401, badKey.status);
  check(
    "bad key -> error envelope",
    get(badKey.json, "error.code") === "unauthorized",
    badKey.json,
  );

  const noKey = await call("GET", "/api/v1/me");
  check("missing key -> 401", noKey.status === 401, noKey.status);

  // -- me ---------------------------------------------------------------
  const me = await call("GET", "/api/v1/me", { key });
  check("GET /me -> 200", me.status === 200, me.status);
  check(
    "GET /me -> seeded org",
    get(me.json, "data.slug") === "acme-indie-studio",
    me.json,
  );
  check("GET /me -> plan is trial", get(me.json, "data.plan") === "trial");

  // -- subreddits -------------------------------------------------------
  const before = await call("GET", "/api/v1/subreddits", { key });
  const beforeCount = Array.isArray(get(before.json, "data"))
    ? (get(before.json, "data") as unknown[]).length
    : -1;
  check("GET /subreddits -> 200", before.status === 200, before.status);
  check("GET /subreddits -> seeded >= 3", beforeCount >= 3, beforeCount);

  const created = await call("POST", "/api/v1/subreddits", {
    key,
    body: { name: "r/IndieHackers" },
  });
  check("POST /subreddits -> 201", created.status === 201, created.status);
  check(
    "POST /subreddits -> normalizes r/ prefix",
    get(created.json, "data.name") === "IndieHackers",
    created.json,
  );
  const createdId = get(created.json, "data.id");

  const dup = await call("POST", "/api/v1/subreddits", {
    key,
    body: { name: "IndieHackers" },
  });
  check("POST duplicate -> 409", dup.status === 409, dup.status);

  const badName = await call("POST", "/api/v1/subreddits", {
    key,
    body: { name: "x" },
  });
  check("POST invalid name -> 400", badName.status === 400, badName.status);

  // -- keyword sets -----------------------------------------------------
  const sets = await call("GET", "/api/v1/keyword-sets", { key });
  const setList = get(sets.json, "data");
  check("GET /keyword-sets -> 200", sets.status === 200, sets.status);
  check(
    "GET /keyword-sets -> seeded >= 1",
    Array.isArray(setList) && setList.length >= 1,
    setList,
  );

  const seededSetId = Array.isArray(setList)
    ? (setList as Array<{ id?: unknown; name?: unknown }>).find(
        (set) => set.name === "Pricing complaints",
      )?.id
    : undefined;

  const newSet = await call("POST", "/api/v1/keyword-sets", {
    key,
    body: { name: "Churn signals", keywords: ["switching", "cancel"] },
  });
  check("POST /keyword-sets -> 201", newSet.status === 201, newSet.status);
  const setId = get(newSet.json, "data.id");

  const patched = await call("PATCH", `/api/v1/keyword-sets/${String(setId)}`, {
    key,
    body: { keywords: ["switching", "refund", "switching"] },
  });
  const patchedKeywords = get(patched.json, "data.keywords");
  check("PATCH /keyword-sets -> 200", patched.status === 200, patched.status);
  check(
    "PATCH /keyword-sets -> de-dupes",
    Array.isArray(patchedKeywords) && patchedKeywords.length === 2,
    patchedKeywords,
  );

  // -- reports ----------------------------------------------------------
  const badReport = await call("GET", "/api/v1/reports/not-a-uuid", { key });
  check("GET /reports/:bad -> 400", badReport.status === 400, badReport.status);

  const report = await call("POST", "/api/v1/reports", { key, body: {} });
  check("POST /reports -> 201", report.status === 201, report.status);
  check(
    "POST /reports -> has themes",
    typeof get(report.json, "data.themeCount") === "number" &&
      (get(report.json, "data.themeCount") as number) >= 1,
    report.json,
  );
  check(
    "POST /reports -> has signals",
    typeof get(report.json, "data.signalCount") === "number" &&
      (get(report.json, "data.signalCount") as number) >= 1,
    report.json,
  );
  const reportId = get(report.json, "data.id");
  const unfilteredCount = get(report.json, "data.signalCount");

  // Keyword set narrows the evidence to matching posts/quotes.
  const filteredReport = await call("POST", "/api/v1/reports", {
    key,
    body: { keywordSetId: String(seededSetId) },
  });
  const filteredCount = get(filteredReport.json, "data.signalCount");
  check(
    "POST /reports (keyword set) -> 201",
    filteredReport.status === 201,
    filteredReport.status,
  );
  check(
    "keyword set narrows the evidence",
    typeof filteredCount === "number" &&
      typeof unfilteredCount === "number" &&
      filteredCount >= 1 &&
      filteredCount < unfilteredCount,
    { filteredCount, unfilteredCount },
  );

  // Ownership validation: unknown ids must be rejected, not silently dropped.
  const foreignSubreddit = await call("POST", "/api/v1/reports", {
    key,
    body: { subredditIds: ["00000000-0000-0000-0000-000000000000"] },
  });
  check(
    "POST /reports (foreign subreddit id) -> 422",
    foreignSubreddit.status === 422,
    foreignSubreddit.status,
  );

  const unknownKeywordSet = await call("POST", "/api/v1/reports", {
    key,
    body: { keywordSetId: "00000000-0000-0000-0000-000000000000" },
  });
  check(
    "POST /reports (unknown keyword set) -> 422",
    unknownKeywordSet.status === 422,
    unknownKeywordSet.status,
  );

  // -- plan quota (trial: 3 reports/month; two generated above) ----------
  const third = await call("POST", "/api/v1/reports", { key, body: {} });
  check(
    "third report (quota boundary) -> 201",
    third.status === 201,
    third.status,
  );
  check(
    "third report -> usage counters present",
    get(third.json, "data.reportsUsedThisMonth") === 3 &&
      get(third.json, "data.reportQuota") === 3,
    third.json,
  );

  const fourth = await call("POST", "/api/v1/reports", { key, body: {} });
  check(
    "fourth report (over quota) -> 402",
    fourth.status === 402,
    fourth.status,
  );
  check(
    "fourth report -> plan_limit_reached",
    get(fourth.json, "error.code") === "plan_limit_reached",
    fourth.json,
  );

  const meWithUsage = await call("GET", "/api/v1/me", { key });
  check(
    "GET /me -> quota surfaced (trial 3/3)",
    get(meWithUsage.json, "data.effectivePlan") === "trial" &&
      get(meWithUsage.json, "data.reportQuota") === 3 &&
      get(meWithUsage.json, "data.reportsUsedThisMonth") === 3,
    meWithUsage.json,
  );

  const fetched = await call("GET", `/api/v1/reports/${String(reportId)}`, {
    key,
  });
  check("GET /reports/:id -> 200", fetched.status === 200, fetched.status);
  check(
    "GET /reports/:id -> complete",
    get(fetched.json, "data.status") === "complete",
    fetched.json,
  );
  check(
    "GET /reports/:id -> markdown present",
    typeof get(fetched.json, "data.markdown") === "string" &&
      (get(fetched.json, "data.markdown") as string).length > 0,
  );

  const list = await call("GET", "/api/v1/reports", { key });
  check(
    "GET /reports -> contains generated report",
    Array.isArray(get(list.json, "data")) &&
      (get(list.json, "data") as unknown[]).length >= 1,
    list.json,
  );

  // -- api keys (mint + revoke) ----------------------------------------
  const minted = await call("POST", "/api/v1/keys", {
    key,
    body: { name: "smoke key" },
  });
  check("POST /keys -> 201", minted.status === 201, minted.status);
  const mintedKey = get(minted.json, "data.key");
  const mintedId = get(minted.json, "data.id");
  check(
    "POST /keys -> plaintext returned once",
    typeof mintedKey === "string" && mintedKey.startsWith("rpr_"),
  );
  check(
    "GET /keys -> never returns hashes",
    JSON.stringify((await call("GET", "/api/v1/keys", { key })).json).includes(
      "keyHash",
    ) === false,
  );

  check(
    "minted key works",
    typeof mintedKey === "string" &&
      (await call("GET", "/api/v1/me", { key: mintedKey })).status === 200,
  );

  const revoked = await call("DELETE", `/api/v1/keys/${String(mintedId)}`, {
    key,
  });
  check("DELETE /keys/:id -> 200", revoked.status === 200, revoked.status);
  check(
    "revoked key -> 401",
    typeof mintedKey === "string" &&
      (await call("GET", "/api/v1/me", { key: mintedKey })).status === 401,
  );

  // -- cleanup ----------------------------------------------------------
  const cleanedSet = await call(
    "DELETE",
    `/api/v1/keyword-sets/${String(setId)}`,
    { key },
  );
  check("DELETE /keyword-sets/:id -> 200", cleanedSet.status === 200);
  const cleanedSub = await call(
    "DELETE",
    `/api/v1/subreddits/${String(createdId)}`,
    { key },
  );
  check("DELETE /subreddits/:id -> 200", cleanedSub.status === 200);

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("[smoke] aborted:", error);
  process.exit(1);
});
