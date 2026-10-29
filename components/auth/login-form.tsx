"use client";

import * as React from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMagicLink, type LoginState } from "@/lib/actions/auth";

/**
 * Email-only sign-in form. The server action sends a magic link and redirects
 * to `?sent=1`; on failure it returns a message we render inline.
 */
export function LoginForm() {
  const [state, formAction, pending] = React.useActionState<
    LoginState,
    FormData
  >(requestMagicLink, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-ink text-sm font-medium">
        Email address
      </label>
      <div className="relative">
        <Mail
          className="text-ink-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          aria-describedby={state?.error ? "login-error" : undefined}
          className="h-12 pl-10"
        />
      </div>

      {state?.error ? (
        <p id="login-error" role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Sending link…
          </>
        ) : (
          "Email me a sign-in link"
        )}
      </Button>

      <p className="text-ink-faint text-xs leading-relaxed">
        No password to remember. The link expires in one hour and works once.
      </p>
    </form>
  );
}
