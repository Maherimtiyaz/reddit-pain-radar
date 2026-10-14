"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";

/**
 * Lets motion honour `prefers-reduced-motion` internally (transform/layout
 * animations are skipped) without branching on the value during render,
 * which would cause a hydration mismatch between server and client.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
