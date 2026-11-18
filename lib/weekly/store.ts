/** Persistence for PainProof Weekly issues (global table, public once published). */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { weeklyIssues, type WeeklyIssue } from "@/db/schema";
import type { WeeklyIssueContent } from "@/lib/weekly/types";

/**
 * Save a generated issue as a draft. Re-running for the same week replaces
 * the draft — but never an issue that is already published.
 */
export async function saveDraft(
  slug: string,
  content: WeeklyIssueContent,
  markdown: string,
): Promise<{ saved: boolean; issue: WeeklyIssue | null }> {
  const [row] = await db
    .insert(weeklyIssues)
    .values({ slug, title: content.title, content, markdown, status: "draft" })
    .onConflictDoUpdate({
      target: weeklyIssues.slug,
      set: { title: content.title, content, markdown, createdAt: new Date() },
      setWhere: eq(weeklyIssues.status, "draft"),
    })
    .returning();
  return { saved: Boolean(row), issue: row ?? null };
}

/** Publish a draft, optionally dropping pains by 1-based index first. */
export async function publishIssue(
  slug: string,
  options: { drop?: number[]; render: (content: WeeklyIssueContent) => string },
): Promise<WeeklyIssue | null> {
  const draft = await db.query.weeklyIssues.findFirst({ where: { slug } });
  if (!draft) return null;
  const drop = new Set(options.drop ?? []);
  const content: WeeklyIssueContent = {
    ...draft.content,
    pains: draft.content.pains.filter((_, index) => !drop.has(index + 1)),
  };
  const [row] = await db
    .update(weeklyIssues)
    .set({
      status: "published",
      publishedAt: draft.publishedAt ?? new Date(),
      content,
      markdown: options.render(content),
    })
    .where(eq(weeklyIssues.id, draft.id))
    .returning();
  return row ?? null;
}

export async function listPublishedIssues(
  limit = 52,
): Promise<Pick<WeeklyIssue, "slug" | "title" | "publishedAt" | "content">[]> {
  return db
    .select({
      slug: weeklyIssues.slug,
      title: weeklyIssues.title,
      publishedAt: weeklyIssues.publishedAt,
      content: weeklyIssues.content,
    })
    .from(weeklyIssues)
    .where(eq(weeklyIssues.status, "published"))
    .orderBy(desc(weeklyIssues.slug))
    .limit(limit);
}

export async function getPublishedIssue(
  slug: string,
): Promise<WeeklyIssue | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slug)) return null;
  const [row] = await db
    .select()
    .from(weeklyIssues)
    .where(
      and(eq(weeklyIssues.slug, slug), eq(weeklyIssues.status, "published")),
    )
    .limit(1);
  return row ?? null;
}
