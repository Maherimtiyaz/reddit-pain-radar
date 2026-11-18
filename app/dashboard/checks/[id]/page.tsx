import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, LoaderCircle } from "lucide-react";

import { CheckReportView } from "@/components/check/report-view";
import { RefreshWhilePending } from "@/components/check/refresh-while-pending";
import { getDashboardCheck } from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Idea check",
  robots: { index: false, follow: false },
};

// Session-gated: no static shell, and navigations may block on the DB.
export const instant = false;

export default async function DashboardCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const check = await getDashboardCheck(id);
  if (!check) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="text-ink-muted hover:text-ink mb-8 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      {check.status === "complete" && check.result ? (
        <CheckReportView result={check.result} />
      ) : check.status === "failed" ? (
        <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-6">
          <h1 className="font-heading text-ink flex items-center gap-2 text-xl font-semibold">
            <CircleAlert
              className="text-destructive size-5"
              aria-hidden="true"
            />
            This check didn&rsquo;t finish
          </h1>
          <p className="text-ink-muted text-sm leading-relaxed">
            Something went wrong while researching. Failed checks don&rsquo;t
            count against your monthly allowance — try again from the dashboard.
          </p>
          <p className="text-ink-faint text-xs">Idea: {check.idea}</p>
        </div>
      ) : (
        <div className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-6">
          <RefreshWhilePending />
          <h1 className="font-heading text-ink flex items-center gap-2 text-xl font-semibold">
            <LoaderCircle
              className="text-brand size-5 animate-spin"
              aria-hidden="true"
            />
            Researching your idea…
          </h1>
          <p className="text-ink-muted text-sm leading-relaxed">
            Reading Hacker News and GitHub for people describing this problem.
            It usually takes 1–3 minutes. This page updates by itself, and
            we&rsquo;ll email you too.
          </p>
          <p className="text-ink-faint text-xs">Idea: {check.idea}</p>
        </div>
      )}
    </div>
  );
}
