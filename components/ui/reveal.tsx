"use client";

import * as React from "react";
import { motion, type Variants } from "motion/react";

import { fadeUp, staggerContainer, staggerItem, VIEWPORT } from "@/lib/motion";

type RevealProps = React.ComponentProps<typeof motion.div> & {
  variants?: Variants;
};

/** Single element that fades/slides up when scrolled into view. */
export function Reveal({
  className,
  children,
  variants = fadeUp,
  ...props
}: RevealProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      variants={variants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Parent for staggered children. Pair with <RevealItem>. */
export function RevealGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      variants={staggerContainer}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Child of <RevealGroup>. Inherits the parent's stagger timing. */
export function RevealItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={staggerItem} className={className} {...props}>
      {children}
    </motion.div>
  );
}
