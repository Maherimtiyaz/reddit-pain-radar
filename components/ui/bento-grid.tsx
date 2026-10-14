import * as React from "react";

import { cn } from "@/lib/utils";

/** Asymmetric bento layout grid. */
export function BentoGrid({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type BentoGridItemProps = React.ComponentProps<"div"> & {
  title: string;
  description: string;
  header?: React.ReactNode;
  icon?: React.ReactNode;
};

export function BentoGridItem({
  className,
  title,
  description,
  header,
  icon,
  ...props
}: BentoGridItemProps) {
  return (
    <div
      className={cn(
        "group/bento border-line bg-surface hover:border-brand/60 relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border p-6 transition-colors duration-300 hover:shadow-[0_0_50px_-16px_rgba(99,102,241,0.55)]",
        className,
      )}
      {...props}
    >
      {header}
      <div className="transition-transform duration-300 group-hover/bento:translate-x-1">
        {icon}
        <h3 className="font-heading text-ink mt-3 font-semibold tracking-tight">
          {title}
        </h3>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
