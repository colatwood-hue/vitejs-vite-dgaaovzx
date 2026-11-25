import Link from "next/link";
import { and, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { thoughts } from "@/db/schema";
import { CaptureForm } from "@/components/studio/CaptureForm";
import { AutoRefresh } from "@/components/studio/AutoRefresh";
import { Badge, Empty, PageHeader, SOURCE_LABELS, relTime } from "@/components/studio/ui";

// Background transcription (after()) runs within this budget.
export const maxDuration = 300;

export const metadata = { title: "Thought Inbox" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string }> }) {
  const { q = "", status = "open", source = "" } = await searchParams;
  const where: SQL[] = [];
  if (status === "open") where.push(ne(thoughts.status, "archived"));
  else if (status) where.push(eq(thoughts.status, status as "new"));
  if (source) where.push(eq(thoughts.sourceType, source as "note"));
  if (q.trim()) {
    const like = `%${q.trim()}%`;
    where.push(or(ilike(thoughts.originalContent, like), ilike(thoughts.transcription, like), ilike(thoughts.title, like))!);
  }
  const rows = await db
    .select({
      id: thoughts.id,
      title: thoughts.title,
      sourceType: thoughts.sourceType,
      originalContent: thoughts.originalContent,
      transcription: thoughts.transcription,
      transcriptionStatus: thoughts.transcriptionStatus,
      tags: thoughts.tags,
      status: thoughts.status,
      privacy: thoughts.privacy,
      hasAnalysis: thoughts.aiAnalyzedAt,
      createdAt: thoughts.createdAt,
    })
    .from(thoughts)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(thoughts.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Capture" title="Thought Inbox" description="Notes, voice memos, quotes, questions. Everything starts here. Originals are never overwritten." />
      <CaptureForm />

      <form className="mt-8 flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Search notes and transcripts" />
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="open">Open</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="used">Used in an idea</option>
            <option value="archived">Archived</option>
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="source" className="field-label">
            Type
          </label>
          <select id="source" name="source" defaultValue={source} className="input">
            <option value="">All types</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-ghost">Filter</button>
      </form>

      <div className="mt-6">
        {rows.some((r) => r.transcriptionStatus === "pending") && <AutoRefresh everyMs={5000} maxTries={40} />}
        {rows.length === 0 ? (
          <Empty>{q || source || status !== "open" ? "Nothing matches those filters." : "Your inbox is empty. Capture the first thought above."}</Empty>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {rows.map((t) => {
              const text = t.originalContent || t.transcription || "";
              return (
                <li key={t.id}>
                  <Link href={`/studio/inbox/${t.id}`} className="block px-1 py-4 hover:bg-card">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge>{SOURCE_LABELS[t.sourceType]}</Badge>
                      {t.status === "new" && <Badge tone="accent">New</Badge>}
                      {t.status === "used" && <Badge tone="ok">In an idea</Badge>}
                      {t.privacy === "sensitive" && <Badge tone="warn">Sensitive</Badge>}
                      {t.transcriptionStatus === "pending" && <Badge tone="accent">Transcribing…</Badge>}
                      {t.transcriptionStatus === "failed" && <Badge tone="danger">Transcription failed</Badge>}
                      {t.transcriptionStatus === "unconfigured" && <Badge tone="warn">Not transcribed</Badge>}
                      {t.hasAnalysis && <Badge>Analysed</Badge>}
                      <span>{relTime(t.createdAt)}</span>
                      {t.tags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                    {t.title && <p className="mt-1.5 font-medium">{t.title}</p>}
                    <p className="mt-1 line-clamp-3 font-serif text-[1.05rem] leading-relaxed text-ink-soft">{text || <em className="text-muted">(audio only)</em>}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
