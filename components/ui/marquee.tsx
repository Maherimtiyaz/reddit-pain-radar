import * as React from "react";

import { cn } from "@/lib/utils";

type MarqueeProps = {
  children: React.ReactNode;
  className?: string;
};

/** Infinite horizontal marquee with edge fade and hover-pause. */
export function Marquee({ children, className }: MarqueeProps) {
  return (
    <div
      className={cn(
        "group flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <div className="animate-marquee flex w-max shrink-0 items-center group-hover:[animation-play-state:paused]">
        <div className="flex items-center gap-14 pr-14">{children}</div>
        <div className="flex items-center gap-14 pr-14" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
