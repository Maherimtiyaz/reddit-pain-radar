"use client";

import * as React from "react";
import { ArrowRight, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startCheckAction, type StartCheckState } from "@/lib/actions/check";
import { checkOrder } from "@/lib/copy";

const INITIAL: StartCheckState = { error: null, idea: "", email: "" };
const MAX_IDEA = 600;

const noopSubscribe = () => () => {};

export function CheckForm({ price }: { price: string }) {
  const [state, formAction, pending] = React.useActionState(
    startCheckAction,
    INITIAL,
  );
  // Controlled, so the text survives a failed submission.
  const [idea, setIdea] = React.useState("");
  // Stripe's cancel URL is /check?canceled=1. Read it from the URL on the
  // client (server snapshot: false) so the page itself stays static.
  const canceled = React.useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).has("canceled"),
    () => false,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {canceled && !state.error ? (
        <p className="border-line bg-surface text-ink-muted rounded-xl border px-4 py-3 text-sm">
          {checkOrder.canceled}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="check-idea" className="text-ink text-sm font-medium">
          {checkOrder.ideaLabel}
        </label>
        <textarea
          id="check-idea"
          name="idea"
          required
          minLength={15}
          maxLength={MAX_IDEA}
          rows={4}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={checkOrder.ideaPlaceholder}
          disabled={pending}
          className="border-line bg-canvas/60 text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-brand/30 w-full resize-y rounded-xl border px-4 py-3 text-base leading-relaxed outline-none focus-visible:ring-3"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {checkOrder.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setIdea(example)}
                disabled={pending}
                className="border-line text-ink-muted hover:border-brand/60 hover:text-ink rounded-full border px-3 py-1.5 text-xs transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
          <span className="text-ink-faint text-xs tabular-nums">
            {idea.length}/{MAX_IDEA}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="check-email" className="text-ink text-sm font-medium">
          {checkOrder.emailLabel}
        </label>
        <Input
          id="check-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="you@example.com"
          disabled={pending}
          className="border-line bg-canvas/60 h-12 text-base"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-2 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-12 gap-2 text-base">
        {pending ? (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {checkOrder.submit} — {price}
        {pending ? null : <ArrowRight className="size-4" />}
      </Button>
      <p className="text-ink-faint text-center text-xs">
        {checkOrder.paymentNote}
      </p>
    </form>
  );
}
