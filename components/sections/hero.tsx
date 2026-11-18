"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";

import { AuroraBackground } from "@/components/ui/aurora-background";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Container } from "@/components/ui/section";
import { Spotlight } from "@/components/ui/spotlight";
import { demo, hero } from "@/lib/copy";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { site } from "@/lib/site";

function ScoreRing({ value }: { value: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative grid size-20 shrink-0 place-items-center">
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-line"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className="stroke-brand"
        />
      </svg>
      <span className="font-heading text-ink absolute text-lg font-semibold">
        {value}
      </span>
    </div>
  );
}

function Bar({
  label,
  value,
  tone = "brand",
}: {
  label: string;
  value: number;
  tone?: "brand" | "signal" | "urgency";
}) {
  const toneClass =
    tone === "signal"
      ? "bg-signal"
      : tone === "urgency"
        ? "bg-urgency"
        : "bg-brand";

  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-muted w-36 shrink-0 text-xs">{label}</span>
      <div className="bg-line h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${toneClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-ink-faint w-7 shrink-0 text-right text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

const EVIDENCE = [
  { source: "Hacker News", detail: "6 searches", count: 40 },
  { source: "Show / Launch HN", detail: "competitors", count: 5 },
] as const;

/** A static rendering of the real sample check in the demo section. */
function MockCheck() {
  const host = site.url.replace(/^https?:\/\//, "");

  return (
    <div className="border-line bg-surface overflow-hidden rounded-2xl border shadow-2xl">
      <div className="border-line bg-surface-2 flex items-center gap-2 border-b px-4 py-3">
        <span className="bg-ink-faint/50 size-3 rounded-full" />
        <span className="bg-ink-faint/35 size-3 rounded-full" />
        <span className="bg-ink-faint/25 size-3 rounded-full" />
        <div className="bg-canvas border-line text-ink-faint ml-3 hidden truncate rounded-md border px-3 py-1 text-xs sm:block">
          {host}/check/failed-payment-recovery
        </div>
      </div>

      <div className="grid md:grid-cols-[210px_1fr]">
        <aside className="border-line bg-surface-2/60 hidden flex-col gap-1 border-r p-4 md:flex">
          <div className="text-ink-faint mb-2 text-[0.65rem] font-medium tracking-widest uppercase">
            Evidence read
          </div>
          {EVIDENCE.map((item, i) => (
            <div
              key={item.source}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                i === 0 ? "bg-brand/15 text-ink" : "text-ink-muted"
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.source}</span>
                <span className="text-ink-faint text-[0.65rem]">
                  {item.detail}
                </span>
              </span>
              <span className="text-ink-faint tabular-nums">{item.count}</span>
            </div>
          ))}
        </aside>

        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-ink-faint text-[0.65rem] font-medium tracking-widest uppercase">
                Idea check
              </div>
              <div className="font-heading text-ink truncate text-sm font-semibold sm:text-base">
                {demo.theme}
              </div>
              <span className="border-urgency/40 bg-urgency/10 text-urgency mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium">
                Verdict: {demo.verdict}
              </span>
            </div>
            <ScoreRing value={demo.score} />
          </div>

          <div className="border-line bg-surface-2/60 text-ink-muted border-l-brand/70 rounded-lg border-l-2 p-3 text-xs leading-relaxed sm:text-sm">
            &ldquo;{demo.quote}&rdquo;
            <div className="text-ink-faint mt-1 text-[0.7rem]">
              {demo.quoteAuthor}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Bar label="Demand" value={80} tone="urgency" />
            <Bar label="Willingness to pay" value={90} tone="signal" />
            <Bar label="Competition openness" value={30} />
            <Bar label="Ease of MVP" value={60} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero({ checkOpen = false }: { checkOpen?: boolean }) {
  return (
    <section
      id="top"
      className="relative overflow-hidden pt-16 pb-16 md:pt-24 md:pb-24"
    >
      <AuroraBackground className="absolute inset-0 -z-20" />
      <div
        className="animate-grid-fade pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,black,transparent)] bg-[size:56px_56px]"
        aria-hidden="true"
      />
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-20" />

      <Container className="relative z-10">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
        >
          <motion.span
            variants={staggerItem}
            className="border-line bg-surface/80 text-ink-muted inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs backdrop-blur"
          >
            <span className="bg-signal animate-pulse-glow size-2 rounded-full" />
            {hero.eyebrow}
          </motion.span>

          <motion.h1
            variants={staggerItem}
            className="font-heading text-ink text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-7xl"
          >
            {hero.headlineLead}{" "}
            <span className="from-brand-light to-brand-violet bg-gradient-to-r bg-clip-text text-transparent">
              {hero.headlineAccent}
            </span>
          </motion.h1>

          <motion.p
            variants={staggerItem}
            className="text-ink-muted max-w-2xl text-base leading-relaxed text-balance md:text-lg"
          >
            {hero.subheadline}
          </motion.p>

          <motion.div
            variants={staggerItem}
            className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
          >
            <Button asChild className="h-12 w-full px-6 text-base sm:w-auto">
              <a href="#subscribe">
                {hero.ctaPrimary}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-line bg-surface/60 h-12 w-full px-6 text-base sm:w-auto"
            >
              <a href="#sample">{hero.ctaSecondary}</a>
            </Button>
          </motion.div>

          <motion.ul
            variants={staggerItem}
            className="text-ink-muted mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
          >
            {hero.bullets.map((bullet) => (
              <li key={bullet} className="flex items-center gap-2">
                <Check
                  className="text-signal size-4 shrink-0"
                  aria-hidden="true"
                />
                {bullet}
              </li>
            ))}
          </motion.ul>

          <motion.p variants={staggerItem} className="text-ink-faint text-xs">
            {checkOpen ? (
              <>
                {hero.noteOpen}{" "}
                <Link
                  href="/check"
                  className="text-brand-light hover:text-brand underline-offset-4 hover:underline"
                >
                  {hero.noteOpenLink}
                </Link>
              </>
            ) : (
              hero.noteSoon
            )}
          </motion.p>
        </motion.div>

        <Reveal className="relative mx-auto mt-14 max-w-4xl md:mt-20">
          <div className="bg-brand/15 absolute -inset-x-8 -top-8 bottom-8 -z-10 rounded-full blur-3xl" />
          <MockCheck />
        </Reveal>
      </Container>
    </section>
  );
}
