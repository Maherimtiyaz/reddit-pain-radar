import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, LoaderCircle } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { CheckReportView } from "@/components/check/report-view";
import { RefreshWhilePending } from "@/components/check/refresh-while-pending";
import { Container } from "@/components/ui/section";
import { getIdeaCheckForViewer } from "@/lib/check/store";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your idea check",
  // Private links: never index, never leak the token via Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function ReportSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="bg-surface-2 h-4 w-32 rounded" />
      <div className="bg-surface-2 h-10 w-3/4 rounded" />
      <div className="bg-surface h-40 rounded-2xl" />
      <div className="bg-surface h-64 rounded-xl" />
    </div>
  );
}

async function Report({ params, searchParams }: PageProps) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.t === "string" ? query.t : null;
  const check = await getIdeaCheckForViewer(id, token);
  if (!check) notFound();

  if (check.status === "complete" && check.result) {
    return <CheckReportView result={check.result} />;
  }

  if (check.status === "failed") {
    return (
      <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-6">
        <h1 className="font-heading text-ink flex items-center gap-2 text-xl font-semibold">
          <CircleAlert className="text-destructive size-5" aria-hidden="true" />
          This check didn&rsquo;t finish
        </h1>
        <p className="text-ink-muted text-sm leading-relaxed">
          Something went wrong while researching your idea. We&rsquo;ve been
          notified. Email{" "}
          <a
            href={`mailto:${site.email}`}
            className="text-brand-light hover:underline"
          >
            {site.email}
          </a>{" "}
          with this page&rsquo;s link and we&rsquo;ll re-run it or refund you.
        </p>
      </div>
    );
  }

  const awaitingPayment = check.status === "pending_payment";
  return (
    <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-6">
      {awaitingPayment ? null : <RefreshWhilePending />}
      <h1 className="font-heading text-ink flex items-center gap-2 text-xl font-semibold">
        <LoaderCircle
          className="text-brand size-5 animate-spin"
          aria-hidden="true"
        />
        {awaitingPayment
          ? "Waiting for payment confirmation"
          : "Researching your idea…"}
      </h1>
      <p className="text-ink-muted text-sm leading-relaxed">
        {awaitingPayment
          ? "As soon as the payment is confirmed, we start the research. This page updates by itself."
          : "We're reading Hacker News and GitHub for people describing this problem. It usually takes 1–3 minutes. This page updates by itself, and we'll email you the link too."}
      </p>
      <p className="text-ink-faint text-xs">Idea: {check.idea}</p>
    </div>
  );
}

export default function CheckPage(props: PageProps) {
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

        <Suspense fallback={<ReportSkeleton />}>
          <Report {...props} />
        </Suspense>

        <p className="text-ink-faint border-line mt-14 border-t pt-6 text-xs leading-relaxed">
          This link is private — anyone with it can read this report. Quotes are
          copied verbatim from public posts and link to the original. This
          report is research, not business, legal or financial advice.
        </p>
      </Container>
    </main>
  );
}
