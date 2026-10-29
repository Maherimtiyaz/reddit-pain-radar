import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/section";
import { site } from "@/lib/site";

type LegalPageProps = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

/** Shared shell for the static legal documents (/privacy, /terms). */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main className="bg-canvas relative flex min-h-svh flex-col">
      <Container className="max-w-3xl py-14 md:py-20">
        <Link
          href="/"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {site.name}
        </Link>

        <h1 className="font-heading text-ink mt-10 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          {title}
        </h1>
        <p className="text-ink-faint mt-3 text-xs">Last updated {updated}</p>

        <div className="mt-10 flex flex-col gap-9">{children}</div>

        <div className="border-line mt-14 flex flex-col gap-2 border-t pt-6">
          <p className="text-ink-muted text-sm">
            Questions about this document?{" "}
            <a
              href={`mailto:${site.email}`}
              className="text-brand-light hover:underline"
            >
              {site.email}
            </a>
          </p>
          <Link
            href="/"
            className="text-ink-faint hover:text-ink text-xs transition-colors"
          >
            {site.name}
          </Link>
        </div>
      </Container>
    </main>
  );
}

type LegalSectionProps = {
  heading: string;
  children: React.ReactNode;
};

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-ink text-lg font-semibold tracking-tight">
        {heading}
      </h2>
      <div className="text-ink-muted flex flex-col gap-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

/** A simple bulleted list in the legal documents' body style. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-zinc-600">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
