/**
 * Restart paid checks that got stuck (the webhook's run never started, or
 * the function was killed mid-run). Safe to run any time, e.g. from cron:
 *
 *   npm run check:resume
 *
 * The private link token is not stored, so it is recovered from the Stripe
 * Checkout Session's metadata to email the buyer. Checks without a session
 * (CLI-created) are re-run without an email.
 */
import "dotenv/config";

import { pool } from "@/db";
import {
  findStuckChecks,
  requeueIfStale,
  runPaidCheck,
} from "@/lib/check/purchase";
import { getStripe } from "@/lib/stripe/client";

async function tokenFor(sessionId: string | null): Promise<string | null> {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY?.trim()) return null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return session.metadata?.t ?? null;
  } catch (error) {
    console.warn(`[resume] could not read session ${sessionId}`, error);
    return null;
  }
}

async function main() {
  const stuck = await findStuckChecks();
  console.log(`[resume] ${stuck.length} stuck check(s)`);
  let failures = 0;
  for (const check of stuck) {
    if (!(await requeueIfStale(check))) continue;
    const row = await runPaidCheck({
      checkId: check.id,
      token: await tokenFor(check.stripeCheckoutSessionId),
    });
    console.log(`[resume] ${check.id}: ${row?.status ?? "claimed elsewhere"}`);
    if (row?.status === "failed") failures += 1;
  }
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
