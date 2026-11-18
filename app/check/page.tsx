import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { CheckForm } from "@/components/check/check-form";
import { CheckPageShell } from "@/components/check/page-shell";
import { Button } from "@/components/ui/button";
import { CHECK_PRICE_LABEL, isCheckSaleOpen } from "@/lib/check/availability";
import { checkOrder } from "@/lib/copy";

export const metadata: Metadata = {
  title: "Check my idea",
  description: checkOrder.subtitle,
  alternates: { canonical: "/check" },
};

export default function CheckOrderPage() {
  const open = isCheckSaleOpen();

  return (
    <CheckPageShell footnote={checkOrder.footnote}>
      <p className="text-brand-light text-xs font-medium tracking-[0.2em] uppercase">
        Check My Idea · {CHECK_PRICE_LABEL}
      </p>
      <h1 className="font-heading text-ink mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        {checkOrder.title}
      </h1>
      <p className="text-ink-muted mt-4 max-w-2xl leading-relaxed">
        {checkOrder.subtitle}
      </p>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {checkOrder.youGet.map((item) => (
          <li
            key={item}
            className="text-ink-muted flex items-start gap-2 text-sm"
          >
            <Check
              className="text-signal mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>

      <div className="border-line bg-surface mt-10 rounded-2xl border p-6 sm:p-8">
        {open ? (
          <CheckForm price={CHECK_PRICE_LABEL} />
        ) : (
          <div className="flex flex-col items-start gap-4">
            <h2 className="font-heading text-ink text-xl font-semibold">
              {checkOrder.soonTitle}
            </h2>
            <p className="text-ink-muted text-sm leading-relaxed">
              {checkOrder.soonBody}
            </p>
            <Button asChild className="h-12 px-6 text-base">
              <Link href="/?ref=check-my-idea#subscribe">
                {checkOrder.soonCta}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </CheckPageShell>
  );
}
