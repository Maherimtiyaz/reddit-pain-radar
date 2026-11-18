"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isCheckSaleOpen } from "@/lib/check/availability";
import { startCheckCheckout } from "@/lib/check/purchase";
import { IdeaValidationError, normalizeIdea } from "@/lib/check/run";
import { rateLimit } from "@/lib/rate-limit";

export type StartCheckState = {
  error: string | null;
  idea: string;
  email: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 };

async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(
    /\/$/,
    "",
  );
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function clientKey(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** Validate the order, create the pending check, and send the buyer to Stripe. */
export async function startCheckAction(
  _previous: StartCheckState,
  formData: FormData,
): Promise<StartCheckState> {
  const rawIdea = String(formData.get("idea") ?? "");
  const rawEmail = String(formData.get("email") ?? "");
  const state = { idea: rawIdea, email: rawEmail };

  if (!isCheckSaleOpen()) {
    return {
      ...state,
      error:
        "Check My Idea isn't open yet. Subscribe to hear the moment it is.",
    };
  }

  const limit = rateLimit(
    `check:${await clientKey()}`,
    RATE_LIMIT.max,
    RATE_LIMIT.windowMs,
  );
  if (!limit.ok) {
    return {
      ...state,
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  let idea: string;
  try {
    idea = normalizeIdea(rawIdea);
  } catch (error) {
    if (error instanceof IdeaValidationError)
      return { ...state, error: error.message };
    throw error;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return {
      ...state,
      error: "Enter a valid email — that's where we send your report.",
    };
  }

  let url: string;
  try {
    ({ url } = await startCheckCheckout({
      idea,
      email,
      origin: await requestOrigin(),
    }));
  } catch (error) {
    console.error("[check] could not start checkout", error);
    return {
      ...state,
      error: "We couldn't start the payment. Please try again in a minute.",
    };
  }
  redirect(url);
}
