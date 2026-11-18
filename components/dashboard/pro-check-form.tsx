"use client";

import * as React from "react";
import { ArrowRight, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runProCheckAction, type ProFormState } from "@/lib/actions/pro";

const INITIAL: ProFormState = { error: null, value: "" };

export function ProCheckForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = React.useActionState(
    runProCheckAction,
    INITIAL,
  );
  const [idea, setIdea] = React.useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="pro-idea" className="sr-only">
        Your idea
      </label>
      <textarea
        id="pro-idea"
        name="idea"
        required
        minLength={15}
        maxLength={600}
        rows={3}
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        disabled={pending || disabled}
        placeholder="Who it's for and what it does — e.g. Booking and payments for independent yoga teachers"
        className="border-line bg-canvas/60 text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-brand/30 w-full resize-y rounded-xl border px-4 py-3 text-base leading-relaxed outline-none focus-visible:ring-3 disabled:opacity-60"
      />
      {state.error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-2 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || disabled}
        className="h-12 gap-2 self-start px-6 text-base"
      >
        {pending ? (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        Check this idea
        {pending ? null : <ArrowRight className="size-4" />}
      </Button>
    </form>
  );
}
