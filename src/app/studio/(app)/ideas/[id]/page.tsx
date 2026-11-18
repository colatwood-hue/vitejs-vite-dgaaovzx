import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { ideaLinks, ideaThoughts, ideas, issues, thoughts } from "@/db/schema";
import { allPillars } from "@/lib/pillars";
import {
  archiveIdeaAction,
  connectIdeasAction,
  disconnectIdeasAction,
  mergeIdeaAction,
  startIssueAction,
  unlinkThoughtAction,
  updateIdeaAction,
} from "@/actions/ideas";
import { ActionForm } from "@/components/studio/ActionForm";
import { AIStudio } from "@/components/studio/AIStudio";
import { Badge, PageHeader, SOURCE_LABELS, STAGES, issueStatusTone, stageLabel } from "@/components/studio/ui";

export const maxDuration = 300;

export default async function IdeaDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, id));
  if (!idea) notFound();
  const [pillars, notes, related, others, [issue], mergedInto] = await Promise.all([
    allPillars(),
    db.select({ t: thoughts }).from(ideaThoughts).innerJoin(thoughts, eq(thoughts.id, ideaThoughts.thoughtId)).where(eq(ideaThoughts.ideaId, id)).orderBy(desc(thoughts.createdAt)),
    db.select({ id: ideas.id, title: ideas.workingTitle, stage: ideas.stage }).from(ideaLinks).innerJoin(ideas, eq(ideas.id, ideaLinks.relatedIdeaId)).where(eq(ideaLinks.ideaId, id)),
    db.select({ id: ideas.id, title: ideas.workingTitle }).from(ideas).where(and(ne(ideas.id, id), isNull(ideas.archivedAt))).orderBy(ideas.workingTitle),
    db.select({ id: issues.id, status: issues.status, title: issues.title }).from(issues).where(eq(issues.ideaId, id)).limit(1),
    idea.mergedIntoId ? db.select({ id: ideas.id, title: ideas.workingTitle }).from(ideas).where(eq(ideas.id, idea.mergedIntoId)) : Promise.resolve([]),
  ]);

  const field = (name: keyof typeof idea, label: string, rows = 3, hint?: string) => (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <textarea id={name} name={name} defaultValue={String(idea[name] ?? "")} rows={rows} className="input text-[0.95rem]" />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-2 text-sm">
        <Link href="/studio/ideas" className="text-muted hover:text-ink">
          ← Ideas
        </Link>
      </p>
      <PageHeader eyebrow={`${idea.conceptNumber ? `Concept ${idea.conceptNumber} · ` : ""}${stageLabel(idea.stage)}`} title={idea.workingTitle}>
        {issue ? (
          <Link href={`/studio/issues/${issue.id}`} className="btn">
            Open issue <Badge tone={issueStatusTone(issue.status)}>{issue.status}</Badge>
          </Link>
        ) : (
          <form action={startIssueAction}>
            <input type="hidden" name="id" value={idea.id} />
            <button className="btn btn-ghost">Write it myself →</button>
          </form>
        )}
      </PageHeader>

      {idea.archivedAt && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-sm border border-warn/30 bg-warn/10 p-3 text-sm">
          <span>
            Archived{mergedInto[0] && (
              <>
                {" "}(merged into{" "}
                <Link href={`/studio/ideas/${mergedInto[0].id}`} className="link">
                  {mergedInto[0].title}
                </Link>
                )
              </>
            )}
            .
          </span>
          <form action={archiveIdeaAction}>
            <input type="hidden" name="id" value={idea.id} />
            <input type="hidden" name="reopen" value="1" />
            <button className="btn btn-ghost btn-sm">Reopen</button>
          </form>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <section className="card p-4 sm:p-5">
            <h2 className="eyebrow mb-4">The idea (your notes)</h2>
            <ActionForm action={updateIdeaAction} hidden={{ id: idea.id }} submitLabel="Save idea" className="space-y-3">
              <div>
                <label className="field-label" htmlFor="workingTitle">
                  Working title
                </label>
                <input id="workingTitle" name="workingTitle" defaultValue={idea.workingTitle} required className="input font-serif text-lg" />
              </div>
              {field("thesis", "Central thesis", 2, "What do you actually believe here? Uncertainty is allowed.")}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className="field-label" htmlFor="primaryPillarId">
                    Pillar
                  </label>
                  <select id="primaryPillarId" name="primaryPillarId" defaultValue={idea.primaryPillarId ?? ""} className="input">
                    <option value="">None</option>
                    {pillars.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="stage">
                    Stage
                  </label>
                  <select id="stage" name="stage" defaultValue={idea.stage} className="input">
                    {STAGES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="targetDate">
                    Target date
                  </label>
                  <input id="targetDate" name="targetDate" type="date" defaultValue={idea.targetDate ?? ""} className="input" />
                </div>
              </div>
              {field("personalExperiences", "Personal experiences", 3, "Real moments only. The AI will never make these up.")}
              {field("supportingStories", "Supporting stories", 3)}
              {field("questions", "Questions", 3)}
              {field("references", "References (books, conversations, links)", 2)}
              {field("audienceRelevance", "Why a reader would care", 2)}
              {field("notes", "Notes", 3)}
            </ActionForm>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="eyebrow">Raw notes ({notes.length})</h2>
            {notes.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No captured notes linked yet. Link them from the{" "}
                <Link href="/studio/inbox" className="link">
                  inbox
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {notes.map(({ t }) => (
                  <li key={t.id} className="rounded-sm bg-paper p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <Link href={`/studio/inbox/${t.id}`} className="hover:text-ink">
                        {SOURCE_LABELS[t.sourceType]} · {t.createdAt.toLocaleDateString("en-CA")} {t.privacy === "sensitive" && "· sensitive (not shared with AI)"}
                      </Link>
                      <form action={unlinkThoughtAction}>
                        <input type="hidden" name="id" value={idea.id} />
                        <input type="hidden" name="thoughtId" value={t.id} />
                        <button className="hover:text-danger" aria-label="Unlink note">
                          Unlink
                        </button>
                      </form>
                    </div>
                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap font-serif text-[0.98rem] text-ink-soft">{t.originalContent || t.transcription || "(audio)"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="eyebrow">Connections</h2>
            {related.length > 0 && (
              <ul className="space-y-1 text-sm">
                {related.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/studio/ideas/${r.id}`} className="link">
                      {r.title}
                    </Link>
                    <form action={disconnectIdeasAction}>
                      <input type="hidden" name="id" value={idea.id} />
                      <input type="hidden" name="relatedId" value={r.id} />
                      <button className="text-xs text-muted hover:text-danger">Disconnect</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={connectIdeasAction} hidden={{ id: idea.id }} submitLabel="Connect" buttonClassName="btn btn-ghost btn-sm" className="space-y-2">
              <label className="field-label" htmlFor="relatedId">
                Connect to another idea
              </label>
              <select id="relatedId" name="relatedId" className="input">
                <option value="">Choose…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </ActionForm>
            <ActionForm action={mergeIdeaAction} hidden={{ id: idea.id }} submitLabel="Merge" buttonClassName="btn btn-ghost btn-sm" className="space-y-2" confirmMessage="Merge this idea into the selected one? Its notes will be appended there and this idea archived (you can reopen it).">
              <label className="field-label" htmlFor="targetId">
                Merge this idea into…
              </label>
              <select id="targetId" name="targetId" className="input">
                <option value="">Choose…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </ActionForm>
            {!idea.archivedAt && (
              <form action={archiveIdeaAction}>
                <input type="hidden" name="id" value={idea.id} />
                <button className="text-sm text-muted hover:text-danger">Archive this idea</button>
              </form>
            )}
          </section>
        </div>

        <div>
          <AIStudio ideaId={idea.id} issueId={issue?.id ?? null} />
        </div>
      </div>
    </div>
  );
}
