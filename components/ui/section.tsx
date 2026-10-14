import * as React from "react";

import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-6xl px-6", className)}
      {...props}
    />
  );
}

export function Section({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("relative w-full py-20 md:py-28", className)}
      {...props}
    />
  );
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";

  return (
    <Reveal
      className={cn(
        "flex flex-col gap-3",
        centered && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-brand-light text-xs font-medium tracking-[0.2em] uppercase">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="font-heading text-ink text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="text-ink-muted max-w-2xl text-base leading-relaxed text-balance md:text-lg">
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}
