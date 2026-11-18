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

  // -- authentication ------------------------------------------------------
  const badKey = await call("GET", "/api/v1/me", { key: "rpr_not_a_real_key" });
  check("bad key -> 401", badKey.status === 401, badKey.status);
  const noKey = await call("GET", "/api/v1/me", {});
  check("missing key -> 401", noKey.status === 401, noKey.status);

  // -- workspace + allowance -------------------------------------------------
  const me = await call("GET", "/api/v1/me", { key });
  check("GET /me -> 200", me.status === 200, me.status);
  check("GET /me -> plan is pro", get(me.json, "data.plan") === "pro", me.json);
  check(
    "GET /me -> checkQuota 30",
    get(me.json, "data.checkQuota") === 30,
    me.json,
  );
  check(
    "GET /me -> checksUsedThisMonth is a number",
    typeof get(me.json, "data.checksUsedThisMonth") === "number",
    me.json,
  );

  // -- checks ------------------------------------------------------------------
  const list = await call("GET", "/api/v1/checks", { key });
  const checks =
    (get(list.json, "data") as Array<Record<string, unknown>>) ?? [];
  check("GET /checks -> 200", list.status === 200, list.status);
  const sample = checks.find((c) => c.status === "complete");
  check("GET /checks -> seeded sample listed", Boolean(sample), checks);

  const badId = await call("GET", "/api/v1/checks/not-a-uuid", { key });
  check("GET /checks/:bad -> 400", badId.status === 400, badId.status);
  const missing = await call(
    "GET",
    "/api/v1/checks/00000000-0000-4000-8000-000000000000",
    { key },
  );
  check("GET /checks/:unknown -> 404", missing.status === 404, missing.status);

  if (sample) {
    const one = await call("GET", `/api/v1/checks/${String(sample.id)}`, {
      key,
    });
    check("GET /checks/:id -> 200", one.status === 200, one.status);
    check(
      "GET /checks/:id -> complete with score",
      get(one.json, "data.score") === 68,
      one.json,
    );
    check(
      "GET /checks/:id -> markdown report",
      String(get(one.json, "data.markdown") ?? "").includes("PainProof check"),
    );
  }

  const badBody = await call("POST", "/api/v1/checks", {
    key,
    body: { nope: true },
  });
  check(
    "POST /checks without idea -> 400",
    badBody.status === 400,
    badBody.status,
  );

  // With an LLM key the server validates the idea (400); without one it
  // reports checks as unavailable (503). Either way nothing is created.
  const short = await call("POST", "/api/v1/checks", {
    key,
    body: { idea: "too short" },
  });
  check(
    "POST /checks short idea -> 400 invalid_idea (or 503 unavailable)",
    (short.status === 400 &&
      get(short.json, "error.code") === "invalid_idea") ||
      (short.status === 503 && get(short.json, "error.code") === "unavailable"),
    short.json,
  );

  // -- keys --------------------------------------------------------------------
  const minted = await call("POST", "/api/v1/keys", {
    key,
    body: { name: "smoke key" },
  });
  check("POST /keys -> 201", minted.status === 201, minted.status);
  const newKey = String(get(minted.json, "data.key") ?? "");
  const newKeyId = String(get(minted.json, "data.id") ?? "");
  check(
    "POST /keys -> plaintext returned once",
    newKey.startsWith("rpr_"),
    minted.json,
  );
  const viaNew = await call("GET", "/api/v1/me", { key: newKey });
  check("new key authenticates", viaNew.status === 200, viaNew.status);

  const revoked = await call("DELETE", `/api/v1/keys/${newKeyId}`, { key });
  check("DELETE /keys/:id -> 200", revoked.status === 200, revoked.status);
  const afterRevoke = await call("GET", "/api/v1/me", { key: newKey });
  check("revoked key -> 401", afterRevoke.status === 401, afterRevoke.status);

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("[api-smoke] aborted:", error);
  process.exit(1);
});
