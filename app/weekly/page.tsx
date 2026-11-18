import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CheckPageShell } from "@/components/check/page-shell";
import { WeeklySubscribeCta } from "@/components/weekly/subscribe-cta";
import { weekRange } from "@/lib/weekly/render";
import { listPublishedIssues } from "@/lib/weekly/store";

export const metadata: Metadata = {
  title: "PainProof Weekly archive",
  description:
    "Every past issue of PainProof Weekly: real problems people complained about, each with linked proof and a build idea.",
  alternates: { canonical: "/weekly" },
};

async function IssueList() {
  await connection();
  let issues: Awaited<ReturnType<typeof listPublishedIssues>> = [];
  try {
    issues = await listPublishedIssues();
  } catch (error) {
    console.error("[weekly] archive unavailable", error);
  }
  if (issues.length === 0) {
    return (
      <p className="text-ink-muted text-sm">
        The first issue is on its way. Subscribe to get it the day it&rsquo;s
        out.
      </p>
    );
  }
  return (
    <ul className="divide-line border-line divide-y rounded-2xl border">
      {issues.map((issue) => (
        <li key={issue.slug}>
          <Link
            href={`/weekly/${issue.slug}`}
            className="hover:bg-surface flex flex-col gap-1 p-5 transition-colors"
          >
            <span className="text-ink-faint text-xs">
              {weekRange(issue.content)} · {issue.content.pains.length} pains
            </span>
            <span className="font-heading text-ink font-semibold">
              {issue.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function WeeklyArchivePage() {
  return (
    <CheckPageShell>
      <p className="text-brand-light text-xs font-medium tracking-[0.2em] uppercase">
        PainProof Weekly
      </p>
      <h1 className="font-heading text-ink mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
        Problems worth building, every week
      </h1>
      <p className="text-ink-muted mt-4 max-w-2xl leading-relaxed">
        Every issue: 5–7 real complaints from Hacker News and GitHub, each with
        the quotes and links behind it, who has the problem, and what you could
        build.
      </p>
      <div className="mt-10 flex flex-col gap-10">
        <Suspense
          fallback={
            <div
              className="bg-surface h-40 animate-pulse rounded-2xl"
              aria-hidden="true"
            />
          }
        >
          <IssueList />
        </Suspense>
        <WeeklySubscribeCta />
      </div>
    </CheckPageShell>
  );
}
