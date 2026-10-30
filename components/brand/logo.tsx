import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The brand mark: a radar aperture (three-quarter ring) with a sweep needle and
 * a center ping. One colour, one weight, no container — so it holds up at 16px
 * in a favicon and at 64px in a hero. `currentColor` keeps it themeable.
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
      {/* 270° of a 2π·9 circle, leaving the aperture at the top right. */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeDasharray="42.41 14.14"
        strokeLinecap="round"
        transform="rotate(-45 12 12)"
      />
      <path
        d="M12 12L16.4 7.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}
