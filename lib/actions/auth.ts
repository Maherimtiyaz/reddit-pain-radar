"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Magic-link auth server actions.
 *
 * `signIn` sends the email; with `redirect: false` it returns instead of
 * bouncing through Auth.js's verify-request route, so we can land on our own
 * `?sent=1` state. `AuthError` means the send itself failed (bad address /
 * provider outage), so we return a message the form can render.
 */

export type LoginState = { error?: string } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  // Same best-effort throttle as checkout: magic-link sends cost money and are
  // a spam vector. 10 requests per IP per 10 minutes.
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(`auth:${ip}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return { error: "Too many sign-in attempts. Try again in a few minutes." };
  }

  try {
    await signIn("resend", {
      email,
      redirectTo: "/dashboard",
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      console.error("[auth] sign-in failed", { email, type: error.type });
      return { error: "Could not send the sign-in link. Please try again." };
    }
    throw error;
  }

  redirect("/login?sent=1");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
