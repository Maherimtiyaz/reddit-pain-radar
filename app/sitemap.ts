import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { site } from "@/lib/site";
import { listPublishedIssues } from "@/lib/weekly/store";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    {
      url: site.url,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${site.url}/check`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${site.url}/weekly`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${site.url}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${site.url}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    const issues = await listPublishedIssues(200);
    for (const issue of issues) {
      pages.push({
        url: `${site.url}/weekly/${issue.slug}`,
        lastModified: issue.publishedAt ?? now,
        changeFrequency: "yearly",
        priority: 0.6,
      });
    }
  } catch (error) {
    // The sitemap must render even if the database is unreachable.
    console.error("[sitemap] could not list weekly issues", error);
  }
  return pages;
}
