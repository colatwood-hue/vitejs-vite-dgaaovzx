import { eq } from "drizzle-orm";
import { db } from "@/db";
import { issues } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { renderIssueEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { renderMarkdown } from "@/lib/markdown";
import { getSettings } from "@/lib/settings";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const [i] = await db.select().from(issues).where(eq(issues.id, id));
  if (!i) return new Response("Not found", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") ?? "md";
  const name = i.slug || "issue";

  if (format === "html" || format === "email") {
    const s = await getSettings();
    const html =
      format === "email"
        ? renderIssueEmail(i, s, { unsubscribeUrl: "{{unsubscribe_url}}", preferencesUrl: "{{preferences_url}}" }, { appUrl: env.appUrl() }).html
        : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${i.title.replace(/</g, "&lt;")}</title></head><body><article><h1>${i.title.replace(/</g, "&lt;")}</h1>${i.subtitle ? `<p><em>${i.subtitle.replace(/</g, "&lt;")}</em></p>` : ""}${renderMarkdown(i.bodyMd)}${i.recommendationMd ? `<h2>Worth your time</h2>${renderMarkdown(i.recommendationMd)}` : ""}${i.closingMd ? `<h2>Something to sit with</h2>${renderMarkdown(i.closingMd)}` : ""}</article></body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${name}${format === "email" ? "-email" : ""}.html"` },
    });
  }

  const front = [
    "---",
    `title: ${JSON.stringify(i.title)}`,
    i.subtitle ? `subtitle: ${JSON.stringify(i.subtitle)}` : "",
    i.number ? `issue: ${i.number}` : "",
    `subject: ${JSON.stringify(i.subject)}`,
    `preview: ${JSON.stringify(i.previewText)}`,
    i.publishedAt ? `published: ${i.publishedAt.toISOString()}` : "",
    "---",
  ].filter(Boolean);
  const md = [
    ...front,
    "",
    `# ${i.title}`,
    "",
    i.bodyMd,
    i.recommendationMd ? `\n## Worth your time\n\n${i.recommendationMd}` : "",
    i.closingMd ? `\n## Something to sit with\n\n${i.closingMd}` : "",
  ].join("\n");
  return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"` } });
}
