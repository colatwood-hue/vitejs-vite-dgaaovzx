import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { issues, pillars } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { getSettings, markOnboarding } from "@/lib/settings";
import { issueLabel } from "@/lib/email/templates";
import { formatDate } from "@/components/IssueList";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** Draft preview exactly as the public article page will render it. Owner only. */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db.select({ issue: issues, pillar: pillars.name }).from(issues).leftJoin(pillars, eq(pillars.id, issues.primaryPillarId)).where(eq(issues.id, id));
  if (!row) notFound();
  const { issue } = row;
  const s = await getSettings();
  if (!s.onboarding.previewed) await markOnboarding("previewed");
  return (
    <article className="mx-auto max-w-[44rem] px-4 py-14 sm:px-6">
      <p className="eyebrow">
        {s.name} · {issueLabel(issue.number)}
      </p>
      <h1 className="mt-5 font-serif text-[2.4rem] leading-[1.12] tracking-tight sm:text-[3.2rem]">{issue.title}</h1>
      {issue.subtitle && <p className="mt-4 font-serif text-xl italic text-ink-soft sm:text-2xl">{issue.subtitle}</p>}
      <p className="mt-6 text-sm text-muted">
        {formatDate(issue.publishedAt ?? new Date())} · {issue.readingMinutes} min read{row.pillar ? ` · ${row.pillar}` : ""}
      </p>
      <div className="mt-8 h-px w-16 bg-bronze" />
      <div className="prose-dash mt-10" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.bodyMd) }} />
      {issue.recommendationMd.trim() && (
        <aside className="mt-14 border-t border-rule pt-8">
          <h2 className="eyebrow text-bronze">Worth your time</h2>
          <div className="prose-dash mt-4 text-[1.1rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.recommendationMd) }} />
        </aside>
      )}
      {issue.closingMd.trim() && (
        <section className="mt-14 border-t border-rule pt-8">
          <h2 className="eyebrow text-bronze">Something to sit with</h2>
          <div className="prose-dash mt-4 italic" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.closingMd) }} />
        </section>
      )}
    </article>
  );
}
