import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, MailCheck } from "lucide-react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Reads the session cookie and search params; nothing to prerender.
export const instant = false;

type LoginSearchParams = {
  sent?: string;
  error?: string;
  // Auth.js's verify-request redirect appends these.
  provider?: string;
  type?: string;
};

const AUTH_ERRORS: Record<string, string> = {
  Verification:
    "That sign-in link is invalid or has expired. Request a new one.",
  Configuration: "Sign-in is not configured on this deployment yet.",
  AccessDenied: "That email is not allowed to sign in.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  // Request-time only: reads the session cookie and renders a server-action form.
  await connection();
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  const sent = params.sent === "1" || params.type === "email";
  const error = params.error
    ? (AUTH_ERRORS[params.error] ?? "Sign-in failed. Please try again.")
    : null;

  return (
    <main className="bg-canvas relative flex min-h-svh flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--color-brand)_18%,transparent),transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-ink mb-10 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {site.name}
        </Link>

        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark className="text-brand size-8" />
          <span className="font-heading text-ink text-lg font-semibold tracking-tight">
            {site.name}
          </span>
        </div>

        <div className="border-line bg-surface rounded-2xl border p-8">
          {sent ? (
            <div className="flex flex-col items-start gap-4">
              <span className="border-signal/30 bg-signal/10 text-signal flex size-11 items-center justify-center rounded-xl border">
                <MailCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="font-heading text-ink text-2xl font-semibold tracking-tight">
                  Check your email
                </h1>
                <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                  We sent you a one-time sign-in link. Open it on this device to
                  reach your dashboard.
                </p>
              </div>
              <p className="text-ink-faint text-xs leading-relaxed">
                Nothing arrived? Check spam, or{" "}
                <Link
                  href="/login"
                  className="text-brand-light hover:underline"
                >
                  try another email
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-brand-light text-xs font-semibold tracking-[0.14em] uppercase">
                  Account
                </p>
                <h1 className="font-heading text-ink mt-2 text-2xl font-semibold tracking-tight">
                  Sign in to {site.name}
                </h1>
                <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                  Enter the email you subscribed with and we&apos;ll send a
                  one-time sign-in link.
                </p>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                >
                  {error}
                </p>
              ) : null}

              <LoginForm />
            </div>
          )}
        </div>

        <p className="text-ink-faint mt-6 text-center text-xs">
          Don&apos;t have an account?{" "}
          <Link href="/#pricing" className="text-brand-light hover:underline">
            Get early access
          </Link>
        </p>
      </div>
    </main>
  );
}
