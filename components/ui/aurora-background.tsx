import * as React from "react";

import { cn } from "@/lib/utils";

type AuroraBackgroundProps = React.ComponentProps<"div"> & {
  showRadialGradient?: boolean;
};

/**
 * Aceternity-style aurora background. Dark-only variant with the
 * project's indigo/violet/emerald/amber palette.
 */
export function AuroraBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        "bg-canvas relative flex flex-col items-center justify-center overflow-hidden",
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "animate-aurora absolute -inset-[10px] opacity-40 blur-[10px] will-change-transform",
            "[background-image:repeating-linear-gradient(100deg,#6366f1_10%,#8b5cf6_15%,#10b981_20%,#f59e0b_25%,#818cf8_30%)]",
            "[background-size:300%_200%] [background-position:50%_50%]",
          )}
        />
      </div>

      {showRadialGradient && (
        <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_20%_20%,black_0%,transparent_70%)]" />
      )}

      {children}
    </div>
  );
}
