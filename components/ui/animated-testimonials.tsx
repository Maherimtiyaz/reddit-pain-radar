"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  rating: number;
};

const ACCENTS = [
  "from-indigo-500/80 to-violet-500/80",
  "from-emerald-500/80 to-teal-500/80",
  "from-amber-500/80 to-orange-500/80",
  "from-sky-500/80 to-indigo-500/80",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AnimatedTestimonialsProps = {
  items: readonly Testimonial[];
  interval?: number;
  className?: string;
};

export function AnimatedTestimonials({
  items,
  interval = 6000,
  className,
}: AnimatedTestimonialsProps) {
  const reduce = useReducedMotion();
  const [[index, direction], setState] = React.useState<[number, number]>([
    0, 0,
  ]);

  const paginate = React.useCallback(
    (dir: number) =>
      setState(([i]) => [(i + dir + items.length) % items.length, dir]),
    [items.length],
  );

  React.useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => paginate(1), interval);
    return () => window.clearInterval(id);
  }, [reduce, interval, paginate]);

  const active = items[index];
  const accent = ACCENTS[index % ACCENTS.length];

  const variants = {
    enter: { opacity: 0, x: direction > 0 ? 40 : -40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: direction > 0 ? -40 : 40 },
  };

  return (
    <div
      className={cn(
        "grid items-center gap-8 md:grid-cols-[260px_1fr] md:gap-12",
        className,
      )}
    >
      <div className="border-line bg-surface relative overflow-hidden rounded-2xl border p-6">
        <div
          className={cn(
            "flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-semibold text-white",
            accent,
          )}
        >
          {initials(active.name)}
        </div>
        <div className="text-ink font-heading mt-5 font-semibold">
          {active.name}
        </div>
        <div className="text-ink-muted text-sm">
          {active.role}, {active.company}
        </div>
        <div className="mt-4 flex gap-0.5">
          {Array.from({ length: active.rating }).map((_, i) => (
            <Star
              key={i}
              className="text-signal size-4 fill-current"
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="relative">
        <div className="min-h-[190px]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.figure
              key={index}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: EASE }}
            >
              <span
                className="text-brand/40 font-heading text-5xl leading-none"
                aria-hidden="true"
              >
                &ldquo;
              </span>
              <blockquote className="text-ink mt-2 text-xl leading-relaxed text-balance md:text-2xl">
                {active.quote}
              </blockquote>
            </motion.figure>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => paginate(-1)}
            aria-label="Previous testimonial"
            className="border-line text-ink-muted hover:border-brand hover:text-ink focus-visible:ring-brand/60 flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => paginate(1)}
            aria-label="Next testimonial"
            className="border-line text-ink-muted hover:border-brand hover:text-ink focus-visible:ring-brand/60 flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="ml-1 flex">
            {items.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setState([i, i > index ? 1 : -1])}
                aria-label={`Show testimonial from ${item.name}`}
                className="flex h-11 items-center justify-center px-2"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index
                      ? "bg-brand w-6"
                      : "bg-line hover:bg-ink-faint w-1.5",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
