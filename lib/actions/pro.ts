"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { findOrgForUser } from "@/db/queries";
import {
  checkQuota,
  effectivePlan,
  hasProAccess,
  startOfUtcMonth,
  watchTopicLimit,
} from "@/lib/billing/limits";
import { runPaidCheck } from "@/lib/check/purchase";
import { IdeaValidationError, normalizeIdea } from "@/lib/check/run";
import { countOrgChecksSince, createIdeaCheck } from "@/lib/check/store";
import { requireDashboardUser } from "@/lib/dashboard/data";
import { isLlmConfigured } from "@/lib/llm/client";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe/client";
import {
  addWatchTopic,
  listWatchTopics,
  normalizeTopic,
  removeWatchTopic,
} from "@/lib/watch/store";

export type ProFormState = { error: string | null; value: string };

/** Session → workspace → plan, re-checked on every action. */
async function requireProWorkspace() {
  const user = await requireDashboardUser();
  const membership = await findOrgForUser(user.id);
  if (!membership) return { user, org: null, plan: null } as const;
  return {
    user,
    org: membership.org,
    plan: effectivePlan(membership.org),
  } as const;
}

export async function runProCheckAction(
  _previous: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const value = String(formData.get("idea") ?? "");
  const { user, org, plan } = await requireProWorkspace();
  if (!org || !plan || !hasProAccess(plan)) {
    return { value, error: "Idea checks are part of PainProof Pro." };
  }
  if (!isLlmConfigured()) {
    return {
      value,
      error: "Checks are temporarily unavailable. Please try again later.",
    };
  }

  const limit = rateLimit(`pro-check:${user.id}`, 10, 10 * 60_000);
  if (!limit.ok) {
    return {
      value,
      error: `Too many checks at once. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const used = await countOrgChecksSince(org.id, startOfUtcMonth());
  if (used >= checkQuota(plan)) {
    return {
      value,
      error: `You've used all ${checkQuota(plan)} checks this month. They reset on the 1st (UTC).`,
    };
  }

  let idea: string;
  try {
    idea = normalizeIdea(value);
  } catch (error) {
    if (error instanceof IdeaValidationError)
      return { value, error: error.message };
    throw error;
  }

  const { id, token } = await createIdeaCheck({
    idea,
    email: user.email,
    origin: "pro",
    orgId: org.id,
    status: "queued",
  });
  after(async () => {
    try {
      await runPaidCheck({ checkId: id, token });
    } catch (error) {
      console.error("[pro] check run crashed", { checkId: id }, error);
    }
  });
  redirect(`/dashboard/checks/${id}`);
}

export async function addWatchTopicAction(
  _previous: ProFormState,
  formData: FormData,
): Promise<ProFormState> {
  const value = String(formData.get("topic") ?? "");
  const { org, plan } = await requireProWorkspace();
  if (!org || !plan || !hasProAccess(plan)) {
    return { value, error: "Niche watch is part of PainProof Pro." };
  }
  const topic = normalizeTopic(value);
  if (!topic)
    return { value, error: "Use 3–60 characters, e.g. “invoice reminders”." };

  const existing = await listWatchTopics(org.id);
  if (existing.length >= watchTopicLimit(plan)) {
    return {
      value,
      error: `You can watch up to ${watchTopicLimit(plan)} topics. Remove one first.`,
    };
  }
  const added = await addWatchTopic(org.id, topic);
  if (!added) return { value, error: "You're already watching that topic." };
  revalidatePath("/dashboard");
  return { value: "", error: null };
}

export async function removeWatchTopicAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const { org } = await requireProWorkspace();
  if (!org || !/^[0-9a-f-]{36}$/i.test(id)) return;
  await removeWatchTopic(org.id, id);
  revalidatePath("/dashboard");
}

async function origin(): Promise<string> {
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

/** Stripe's hosted billing portal: change card, download invoices, cancel. */
export async function openBillingPortalAction(): Promise<void> {
  const { org } = await requireProWorkspace();
  if (!org?.stripeCustomerId || !process.env.STRIPE_SECRET_KEY?.trim()) {
    redirect("/dashboard?billing=unavailable");
  }
  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${await origin()}/dashboard`,
    });
    url = session.url;
  } catch (error) {
    console.error("[billing] portal session failed", error);
    redirect("/dashboard?billing=unavailable");
  }
  redirect(url);
}
