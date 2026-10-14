"use client";

import * as React from "react";
import { Check, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/ui/reveal";
import { Container, Section } from "@/components/ui/section";
import { joinWaitlist } from "@/lib/actions/waitlist";
import { finalCta } from "@/lib/copy";

/** Attribution captured from `?ref=` / `?utm_source=` without a hook, so the page stays static. */
function currentSource(): string {
  if (typeof window === "undefined") return "landing";
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") ?? params.get("utm_source") ?? "landing";
}

export function FinalCta() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const result = await joinWaitlist(value, currentSource());
      if (result.ok) {
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Section id="waitlist" className="pb-24">
      <Container className="max-w-3xl">
        <Reveal className="border-line from-surface to-canvas relative overflow-hidden rounded-3xl border bg-gradient-to-b px-6 py-14 text-center sm:px-12">
          <div className="bg-brand/20 pointer-events-none absolute -top-32 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl" />
          <div className="relative flex flex-col items-center gap-4">
            <span className="border-line bg-surface/80 text-ink-muted inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur">
              <Mail className="size-3.5" aria-hidden="true" />
              Early access
            </span>
            <h2 className="font-heading text-ink text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              {finalCta.headline}
            </h2>
            <p className="text-ink-muted max-w-xl text-base text-balance">
              {finalCta.subtitle}
            </p>

            {submitted ? (
              <div className="border-signal/40 bg-signal/10 text-signal mt-2 flex items-center gap-2 rounded-xl border px-5 py-4 text-sm">
                <Check className="size-4" aria-hidden="true" />
                {finalCta.success}
              </div>
            ) : (
              <>
                <form
                  onSubmit={handleSubmit}
                  className="mt-2 flex w-full max-w-md flex-col gap-3 sm:flex-row"
                >
                  <label htmlFor="waitlist-email" className="sr-only">
                    Email address
                  </label>
                  <Input
                    id="waitlist-email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={finalCta.inputPlaceholder}
                    aria-invalid={error ? true : undefined}
                    disabled={pending}
                    className="border-line bg-canvas/60 h-12 flex-1 text-base"
                  />
                  <Button
                    type="submit"
                    disabled={pending}
                    className="h-12 gap-2 px-6 text-base"
                  >
                    {pending ? (
                      <span
                        aria-hidden="true"
                        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : null}
                    {finalCta.button}
                  </Button>
                </form>
                {error ? (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                ) : null}
              </>
            )}

            <p className="text-ink-faint text-xs">{finalCta.trust}</p>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
