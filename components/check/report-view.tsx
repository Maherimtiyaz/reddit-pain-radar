import {
  ExternalLink,
  FlaskConical,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";

import {
  SIGNAL_LABELS,
  SIGNAL_QUESTIONS,
  SIGNAL_WEIGHTS,
  VERDICT_LABELS,
} from "@/lib/check/score";
import type { CheckResult, SignalKey, Verdict } from "@/lib/check/types";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, string> = {
  build: "border-signal/40 bg-signal/10 text-signal",
  niche_down: "border-urgency/40 bg-urgency/10 text-urgency",
  skip: "border-destructive/40 bg-destructive/10 text-destructive",
  insufficient: "border-line bg-surface-2 text-ink-muted",
};

const SOURCE_NAMES = { hackernews: "Hacker News", github: "GitHub" } as const;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-28 shrink-0 place-items-center">
      <svg viewBox="0 0 104 104" className="size-28 -rotate-90">
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-line"
        />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="stroke-brand"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-heading text-ink text-3xl font-semibold tabular-nums">
          {score}
        </span>
        <span className="text-ink-faint text-[0.6rem] tracking-widest uppercase">
          of 100
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-ink flex items-center gap-2 text-lg font-semibold tracking-tight">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A finished Check My Idea report. Server component; no client JS. */
export function CheckReportView({ result }: { result: CheckResult }) {
  const sources = result.sources.filter((s) => s.searches > 0);

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-6">
        <div>
          <p className="text-brand-light text-xs font-medium tracking-[0.2em] uppercase">
            PainProof check
          </p>
          <h1 className="font-heading text-ink mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {result.headline}
          </h1>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            <span className="text-ink-faint">Idea:</span> {result.idea}
          </p>
          <p className="text-ink-faint mt-2 text-xs">
            {formatDate(result.generatedAt)} ·{" "}
            {sources.length > 0
              ? sources
                  .map(
                    (s) =>
                      `${SOURCE_NAMES[s.source]}: ${s.searches} searches, ${s.itemsRead} items read`,
                  )
                  .join(" · ")
              : "no sources searched"}
          </p>
        </div>

        <div className="border-line bg-surface flex flex-col gap-5 rounded-2xl border p-6 sm:flex-row sm:items-center">
          {result.score !== null ? <ScoreRing score={result.score} /> : null}
          <div className="flex flex-col gap-3">
            <span
              className={cn(
                "inline-flex w-fit rounded-full border px-3 py-1 text-sm font-medium",
                VERDICT_STYLE[result.verdict],
              )}
            >
              Verdict: {VERDICT_LABELS[result.verdict]}
            </span>
            {result.summary ? (
              <p className="text-ink-muted text-sm leading-relaxed">
                {result.summary}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {result.signals ? (
        <Section title="Scores">
          <div className="border-line overflow-hidden rounded-xl border">
            {(Object.keys(SIGNAL_WEIGHTS) as SignalKey[]).map((key) => {
              const signal = result.signals?.[key];
              if (!signal) return null;
              return (
                <div
                  key={key}
                  className="border-line flex flex-col gap-2 border-b p-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-6"
                >
                  <div className="sm:w-56 sm:shrink-0">
                    <div className="text-ink text-sm font-medium">
                      {SIGNAL_LABELS[key]}
                    </div>
                    <div className="text-ink-faint text-xs">
                      {SIGNAL_QUESTIONS[key]}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="bg-line h-1.5 flex-1 overflow-hidden rounded-full">
                        <div
                          className="bg-brand h-full rounded-full"
                          style={{ width: `${signal.score * 10}%` }}
                        />
                      </div>
                      <span className="text-ink w-10 text-right text-sm tabular-nums">
                        {signal.score}/10
                      </span>
                    </div>
                    {signal.reason ? (
                      <p className="text-ink-muted text-sm leading-relaxed">
                        {signal.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-ink-faint text-xs leading-relaxed">
            Score = (Demand × 0.30 + Willingness to pay × 0.30 + Openness × 0.25
            + Ease × 0.15) × 10. 75+ build · 55–74 niche down · below 55 skip.
          </p>
        </Section>
      ) : null}

      {result.proof.length > 0 ? (
        <Section title="Proof: what real people said">
          <div className="flex flex-col gap-4">
            {result.proof.map((quote) => (
              <figure
                key={quote.url + quote.quote}
                className="border-brand/60 bg-surface-2/60 rounded-xl border-l-2 p-4"
              >
                <blockquote className="text-ink text-sm leading-relaxed">
                  &ldquo;{quote.quote}&rdquo;
                </blockquote>
                <figcaption className="text-ink-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <a
                    href={quote.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="hover:text-ink-muted inline-flex items-center gap-1 underline underline-offset-4"
                  >
                    {SOURCE_NAMES[quote.source]}, {formatDate(quote.date)}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  {quote.why ? (
                    <span className="italic">{quote.why}</span>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {result.competitors.length > 0 ? (
        <Section title="Who already solves this">
          <div className="grid gap-3 sm:grid-cols-2">
            {result.competitors.map((competitor) => (
              <div
                key={competitor.name}
                className="border-line bg-surface flex flex-col gap-2 rounded-xl border p-4"
              >
                <div className="text-ink text-sm font-medium">
                  {competitor.url ? (
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="hover:text-brand-light inline-flex items-center gap-1"
                    >
                      {competitor.name}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    competitor.name
                  )}
                </div>
                {competitor.whatTheyDo ? (
                  <p className="text-ink-muted text-sm">
                    {competitor.whatTheyDo}
                  </p>
                ) : null}
                {competitor.weakSpot ? (
                  <p className="text-ink-faint text-xs">
                    <span className="text-urgency">Weak spot:</span>{" "}
                    {competitor.weakSpot}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {result.angles.length > 0 ? (
        <Section
          title="Best angles for you"
          icon={<Lightbulb className="text-brand size-4" aria-hidden="true" />}
        >
          <ol className="flex flex-col gap-3">
            {result.angles.map((angle, index) => (
              <li
                key={angle.title}
                className="text-ink-muted flex gap-3 text-sm leading-relaxed"
              >
                <span className="bg-brand/15 text-brand-light grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <span>
                  <span className="text-ink font-medium">{angle.title}.</span>{" "}
                  {angle.why}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {result.test48h ? (
        <Section
          title="Your 48-hour test"
          icon={
            <FlaskConical className="text-signal size-4" aria-hidden="true" />
          }
        >
          <p className="border-signal/30 bg-signal/5 text-ink rounded-xl border p-4 text-sm leading-relaxed">
            {result.test48h}
          </p>
        </Section>
      ) : null}

      {result.limits ? (
        <Section
          title="Limits of this report"
          icon={
            <ShieldAlert className="text-ink-faint size-4" aria-hidden="true" />
          }
        >
          <p className="text-ink-muted text-sm leading-relaxed">
            {result.limits}
          </p>
        </Section>
      ) : null}
    </article>
  );
}
