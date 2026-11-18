import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Container } from "@/components/ui/section";
import { site } from "@/lib/site";

/** Minimal shell for the /check pages: logo home link + newsletter link. */
export function CheckPageShell({
  children,
  footnote,
}: {
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <main className="bg-canvas flex min-h-svh flex-col">
      <Container className="max-w-3xl py-10 md:py-14">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight"
          >
            <LogoMark className="text-brand size-7" />
            {site.name}
          </Link>
          <Link
            href="/#subscribe"
            className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Get the free weekly
          </Link>
        </div>
        {children}
        {footnote ? (
          <p className="text-ink-faint border-line mt-14 border-t pt-6 text-xs leading-relaxed">
            {footnote}
          </p>
        ) : null}
      </Container>
    </main>
  );
}
