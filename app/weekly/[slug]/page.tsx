import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CheckPageShell } from "@/components/check/page-shell";
import { WeeklyIssueView } from "@/components/weekly/issue-view";
import { WeeklySubscribeCta } from "@/components/weekly/subscribe-cta";
import { getPublishedIssue } from "@/lib/weekly/store";

type PageProps = { params: Promise<{ slug: string }> };

async function loadIssue(slug: string) {
  try {
    return await getPublishedIssue(slug);
  } catch (error) {
    console.error("[weekly] issue unavailable", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const issue = await loadIssue(slug);
  if (!issue) return { title: "PainProof Weekly" };
  const description =
    issue.content.intro ||
    issue.content.pains
      .map((pain) => pain.title)
      .join(" · ")
      .slice(0, 200);
  return {
    title: `${issue.title} — PainProof Weekly`,
    description,
    alternates: { canonical: `/weekly/${slug}` },
    openGraph: { type: "article", title: issue.title, description },
  };
}

async function Issue({ params }: PageProps) {
  const { slug } = await params;
  await connection();
  const issue = await loadIssue(slug);
  if (!issue) notFound();
  return <WeeklyIssueView content={issue.content} />;
}

export default function WeeklyIssuePage(props: PageProps) {
  return (
    <CheckPageShell>
      <Link
        href="/weekly"
        className="text-ink-muted hover:text-ink mb-8 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All issues
      </Link>
      <Suspense
        fallback={
          <div
            className="bg-surface h-96 animate-pulse rounded-2xl"
            aria-hidden="true"
          />
        }
      >
        <Issue {...props} />
      </Suspense>
      <div className="mt-12">
        <WeeklySubscribeCta />
      </div>
    </CheckPageShell>
  );
}
