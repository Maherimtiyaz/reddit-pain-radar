"use client";

import * as React from "react";
import { useInView, useReducedMotion } from "motion/react";

type CountUpProps = {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
};

/**
 * Counts from 0 to `value` the first time it scrolls into view.
 *
 * The prerendered HTML carries the final `value`, so crawlers and no-JS
 * visitors never read a placeholder `0`. Numbers already on screen when the
 * page paints keep that value instead of counting up: animating them would
 * flash the number the visitor just saw back down to zero.
 */
export function CountUp({
  value,
  duration = 1.2,
  suffix = "",
  className,
}: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  // A positive root margin starts the count just before the number scrolls in,
  // so the reset to 0 happens while it is still off screen (no visible flash).
  const inView = useInView(ref, { once: true, margin: "120px 0px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(value);

  /**
   * Whether the number was already on screen at first paint. Measured in an
   * effect (layout is final there) that runs before the IntersectionObserver
   * reports, since that callback fires a frame later.
   */
  const visibleOnMount = React.useRef(true);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    visibleOnMount.current = rect.top < window.innerHeight && rect.bottom > 0;
  }, []);

  const started = React.useRef(false);
  const frame = React.useRef(0);

  // Cancel a frame only on unmount. Re-running this component's animation
  // effect (e.g. when `useReducedMotion` resolves after hydration) must not
  // strand a half-finished count.
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);

  React.useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;

    // Reduced motion, or already visible: show the final value immediately.
    if (reduce || visibleOnMount.current) {
      setDisplay(value);
      return;
    }

    const total = duration * 1000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / total, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    setDisplay(0);
    frame.current = requestAnimationFrame(tick);
  }, [inView, reduce, value, duration]);

  // Keep the fallback in sync if the metric changes before it animates.
  React.useEffect(() => {
    if (started.current) return;
    setDisplay(value);
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
