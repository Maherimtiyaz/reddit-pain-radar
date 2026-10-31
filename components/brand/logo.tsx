import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The brand mark: a seismograph reading with its peak marked. The product is a
 * device that watches conversations and reports where the pain spikes; the
 * glyph is exactly that reading, not a radar dish.
 *
 * Behaviour worth preserving:
 * - One colour (`currentColor`) and one stroke weight, so it tints to any
 *   surface and never needs a second asset.
 * - Horizontal composition, so it balances a wordmark instead of competing
 *   with it, and reads as a different silhouette from every round icon in the
 *   category.
 * - Legible at 16px: four strokes and a dot, ink inside 2–22, stroke 2.3 on a
 *   24 grid. The spike survives a browser tab; finer detail would not.
 * - No container. The mark is the shape, so it fills an app icon as happily as
 *   it sits next to the name.
 */
export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
      {...props}
    >
      <path
        d="M3 15.2h5.2L11 6.2l3.4 12.4 2.2-6.4H21"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="6.2" r="2.3" fill="currentColor" />
    </svg>
  );
}
