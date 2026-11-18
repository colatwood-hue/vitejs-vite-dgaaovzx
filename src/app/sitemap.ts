import type { MetadataRoute } from "next";
import { publishedIssues } from "@/lib/issues";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl();
  const issues = await publishedIssues();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/archive`, changeFrequency: "weekly" },
    { url: `${base}/about`, changeFrequency: "monthly" },
    { url: `${base}/subscribe`, changeFrequency: "monthly" },
    ...issues.map((i) => ({ url: `${base}/issues/${i.slug}`, lastModified: i.publishedAt ?? undefined })),
  ];
}
