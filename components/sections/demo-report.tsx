"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { Reveal } from "@/components/ui/reveal";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { demo } from "@/lib/copy";
import { EASE } from "@/lib/motion";

const ctaHref = "/api/checkout";

function AnimatedBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-muted w-36 shrink-0 text-xs sm:text-sm">
        {label}
      </span>
      <div className="bg-line h-2 flex-1 overflow-hidden rounded-full">
        <motion.div
          className="from-brand to-brand-violet h-full rounded-full bg-gradient-to-r"
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1, ease: EASE }}
        />
      </div>
      <span className="text-ink-faint w-8 shrink-0 text-right text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

function AnimatedScore() {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const target = circumference * (1 - demo.score / 100);

  return (
    <div className="relative grid size-32 shrink-0 place-items-center sm:size-36">
      <svg viewBox="0 0 104 104" className="size-32 -rotate-90 sm:size-36">
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-line"
        />
        <motion.circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="stroke-brand"
          initial={{ strokeDashoffset: circumference }}
          whileInView={{ strokeDashoffset: target }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-heading text-ink text-3xl font-semibold tabular-nums">
          <CountUp value={demo.score} />
        </span>
        <span className="text-ink-faint text-[0.65rem] tracking-widest uppercase">
          score
        </span>
      </div>
    </div>
  );
}

export function DemoReport() {
  return (
    <Section id="demo" className="bg-surface/30 border-line border-y">
      <Container>
        <SectionHeading
          eyebrow={demo.eyebrow}
          title={demo.title}
          subtitle={demo.subtitle}
        />

        <Reveal className="mt-14">
          <div className="border-line bg-surface relative overflow-hidden rounded-3xl border p-6 shadow-2xl sm:p-10">
            <div className="bg-brand/10 pointer-events-none absolute -top-24 right-0 size-72 rounded-full blur-3xl" />

            <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-5">
                  <AnimatedScore />
                  <div>
                    <div className="text-ink-faint text-[0.7rem] font-medium tracking-widest uppercase">
                      Theme
                    </div>
                    <div className="font-heading text-ink mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                      {demo.theme}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {demo.metrics.map((metric) => (
                        <span
                          key={metric.label}
                          className="border-line bg-surface-2 text-ink-muted rounded-full border px-3 py-1 text-xs"
                        >
                          {metric.label}:{" "}
                          <span
                            className={
                              metric.tone === "urgency"
                                ? "text-urgency font-semibold"
                                : "text-signal font-semibold"
                            }
                          >
                            {metric.value}/10
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <figure className="border-brand/60 bg-surface-2/60 rounded-xl border-l-2 p-4">
                  <blockquote className="text-ink text-sm leading-relaxed sm:text-base">
                    &ldquo;{demo.quote}&rdquo;
                  </blockquote>
                  <figcaption className="text-ink-faint mt-2 text-xs">
                    {demo.quoteAuthor}
                  </figcaption>
                </figure>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  {demo.signals.map((signal) => (
                    <AnimatedBar
                      key={signal.label}
                      label={signal.label}
                      value={signal.value}
                    />
                  ))}
                </div>

                <div className="border-line bg-surface-2/60 rounded-xl border p-4">
                  <div className="text-brand-light mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Build recommendation
                  </div>
                  <p className="text-ink-muted text-sm leading-relaxed">
                    {demo.recommendation}
                  </p>
                </div>

                <Button
                  asChild
                  className="h-12 w-full text-base sm:w-auto sm:self-start"
                >
                  <a href={ctaHref}>
                    {demo.cta}
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
