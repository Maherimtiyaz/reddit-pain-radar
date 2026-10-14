"use client";

import * as React from "react";
import { useInView, useReducedMotion } from "motion/react";

type CountUpProps = {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
};

/** Counts from 0 to `value` once the element scrolls into view. */
export function CountUp({
  value,
  duration = 1.2,
  suffix = "",
  className,
}: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;

    const total = reduce ? 0 : duration * 1000;
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = total === 0 ? 1 : Math.min((now - start) / total, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
