import { publishedIssues } from "@/lib/issues";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { absolutizeUrls, renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

const x = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function GET() {
  const [s, issues] = await Promise.all([getSettings(), publishedIssues({ limit: 50 })]);
  const base = env.appUrl();
  const items = issues
    .map((i) => {
      const url = `${base}/issues/${i.slug}`;
      const html = absolutizeUrls(renderMarkdown(i.bodyMd), base);
      return `<item><title>${x(i.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${i.publishedAt!.toUTCString()}</pubDate>${i.subtitle || i.previewText ? `<description>${x(i.subtitle || i.previewText)}</description>` : ""}<content:encoded><![CDATA[${html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${x(s.name)}</title><link>${base}</link><description>${x(s.tagline)}</description><language>en-ca</language>
<atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
