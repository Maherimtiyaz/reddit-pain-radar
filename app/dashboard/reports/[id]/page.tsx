import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";

import { getDashboardReport } from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Report",
  robots: { index: false, follow: false },
};

// Session-gated: no static shell, and navigations may block on the DB.
export const instant = false;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getDashboardReport(id);
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="text-ink-muted hover:text-ink mb-6 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      <header className="mb-6">
        <p className="text-brand-light text-xs font-semibold tracking-[0.14em] uppercase">
          Pain report
        </p>
        <h1 className="font-heading text-ink mt-1.5 text-2xl font-semibold tracking-tight">
          {dateFormatter.format(report.generatedAt ?? report.createdAt)}
        </h1>
        <p className="text-ink-faint mt-1 font-mono text-xs">{report.id}</p>
      </header>

      {report.status !== "complete" || !report.markdownContent ? (
        <div className="border-urgency/30 bg-urgency/10 text-urgency flex items-start gap-2 rounded-xl border px-5 py-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            This report is <span className="capitalize">{report.status}</span>{" "}
            and has no content yet.
          </p>
        </div>
      ) : (
        <article className="border-line bg-surface rounded-2xl border p-6">
          <pre className="text-ink-muted font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
            {report.markdownContent}
          </pre>
        </article>
      )}
    </div>
  );
}
