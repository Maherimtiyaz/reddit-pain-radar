"use server";

import { headers } from "next/headers";

import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export type WaitlistResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_RE = /[^a-z0-9._-]+/g;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

/** Collapse an untrusted attribution string into a short, safe slug. */
function normalizeSource(source?: string): string {
  const cleaned = (source ?? "")
    .trim()
    .toLowerCase()
    .replace(SOURCE_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "landing";
}

/** Best-effort client identity for throttling (proxies set the first XFF hop). */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/**
 * Records an early-access email captured by the landing-page waitlist form.
 *
 * The `waitlist` table is global (not org-scoped), so this writes through the
 * untenanted `db` client. When `DATABASE_URL` is not configured (local dev,
 * CI, or a Stripe-only deploy) the signup is logged and still reported as a
 * success so the flow never breaks for the visitor.
 */
export async function joinWaitlist(
  rawEmail: string,
  rawSource?: string,
): Promise<WaitlistResult> {
  const limit = rateLimit(
    `waitlist:${await clientKey()}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const source = normalizeSource(rawSource);

  if (!process.env.DATABASE_URL) {
    console.info(
      `[waitlist] accepted (DATABASE_URL unset, not persisted): ${email} (source=${source})`,
    );
    return { ok: true };
  }

  try {
    await db.insert(waitlist).values({ email, source }).onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    console.error("[waitlist] failed to persist signup", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
