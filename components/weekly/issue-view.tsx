import { ExternalLink } from "lucide-react";

import { VERDICT_LABELS } from "@/lib/check/score";
import { weekRange } from "@/lib/weekly/render";
import type { WeeklyIssueContent, WeeklyVerdict } from "@/lib/weekly/types";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<WeeklyVerdict, string> = {
  build: "border-signal/40 bg-signal/10 text-signal",
  niche_down: "border-urgency/40 bg-urgency/10 text-urgency",
  skip: "border-line bg-surface-2 text-ink-muted",
};
const SOURCE_NAMES = { hackernews: "Hacker News", github: "GitHub" } as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="text-ink-muted text-sm leading-relaxed">
      <span className="text-ink font-medium">{label}:</span> {children}
    </p>
  );
}

/** A published PainProof Weekly issue. Server component. */
export function WeeklyIssueView({ content }: { content: WeeklyIssueContent }) {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="text-brand-light text-xs font-medium tracking-[0.2em] uppercase">
          PainProof Weekly · {weekRange(content)}
        </p>
        <h1 className="font-heading text-ink mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          {content.title}
        </h1>
        {content.intro ? (
          <p className="text-ink-muted mt-4 leading-relaxed">{content.intro}</p>
        ) : null}
      </header>

      <ol className="flex flex-col gap-8">
        {content.pains.map((pain, index) => (
          <li
            key={pain.title}
            className="border-line bg-surface flex flex-col gap-4 rounded-2xl border p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-heading text-ink text-xl font-semibold tracking-tight">
                <span className="text-ink-faint mr-2 tabular-nums">
                  {index + 1}.
                </span>
                {pain.title}
              </h2>
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  VERDICT_STYLE[pain.verdict],
                )}
              >
                {VERDICT_LABELS[pain.verdict]}
              </span>
            </div>
            {pain.pain ? (
              <p className="text-ink leading-relaxed">{pain.pain}</p>
            ) : null}

            <div className="flex flex-col gap-3">
              {pain.proof.map((quote) => (
                <figure
                  key={quote.url}
                  className="border-brand/60 bg-surface-2/60 rounded-xl border-l-2 p-4"
                >
                  <blockquote className="text-ink text-sm leading-relaxed">
                    &ldquo;{quote.quote}&rdquo;
                  </blockquote>
                  <figcaption className="text-ink-faint mt-2 text-xs">
                    <a
                      href={quote.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="hover:text-ink-muted inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      {SOURCE_NAMES[quote.source]}, {quote.date}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </figcaption>
                </figure>
              ))}
              {pain.signal ? (
                <p className="text-ink-faint text-xs">Signal: {pain.signal}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              {pain.whoHasIt ? (
                <Field label="Who has it">{pain.whoHasIt}</Field>
              ) : null}
              {pain.whatExists ? (
                <Field label="What exists">{pain.whatExists}</Field>
              ) : null}
              {pain.buildIdea ? (
                <Field label="Build it as">{pain.buildIdea}</Field>
              ) : null}
              {pain.verdictReason ? (
                <Field label="Verdict">{pain.verdictReason}</Field>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-ink-faint text-xs leading-relaxed">
        Made from {content.stats.itemsRead} public posts across{" "}
        {content.stats.searches} searches. Every quote is verbatim and links to
        its source.
      </p>
    </article>
  );
}
