"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addWatchTopicAction, type ProFormState } from "@/lib/actions/pro";

const INITIAL: ProFormState = { error: null, value: "" };

export function WatchTopicForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = React.useActionState(
    addWatchTopicAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="watch-topic" className="sr-only">
          Topic to watch
        </label>
        <Input
          id="watch-topic"
          name="topic"
          required
          minLength={3}
          maxLength={60}
          defaultValue={state.value}
          key={state.value === "" && !state.error ? "reset" : "keep"}
          placeholder="e.g. invoice reminders"
          disabled={pending || disabled}
          className="border-line bg-canvas/60 h-11 flex-1"
        />
        <Button
          type="submit"
          disabled={pending || disabled}
          className="h-11 gap-1.5 px-4"
        >
          <Plus className="size-4" aria-hidden="true" />
          Watch
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
