import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { ideaThoughts, ideas, thoughtPillars, thoughts } from "@/db/schema";
import { allPillars } from "@/lib/pillars";
import { aiConfigured } from "@/lib/ai/client";
import { transcriptionConfigured } from "@/lib/transcription";
import {
  analyzeThoughtAction,
  createIdeaFromThoughtAction,
  linkThoughtToIdeaAction,
  saveAnalysisAction,
  transcribeAction,
  updateThoughtAction,
} from "@/actions/thoughts";
import { ActionForm } from "@/components/studio/ActionForm";
import { AutoRefresh } from "@/components/studio/AutoRefresh";
import { nowMs } from "@/lib/time";
import { Badge, PageHeader, SOURCE_LABELS, stageLabel } from "@/components/studio/ui";

// Background transcription (after()) runs within this budget.
export const maxDuration = 300;

export default async function ThoughtDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t] = await db.select().from(thoughts).where(eq(thoughts.id, id));
  if (!t) notFound();
  const [pillars, selected, linked, openIdeas] = await Promise.all([
    allPillars(),
    db.select().from(thoughtPillars).where(eq(thoughtPillars.thoughtId, id)),
    db.select({ id: ideas.id, title: ideas.workingTitle, stage: ideas.stage }).from(ideaThoughts).innerJoin(ideas, eq(ideas.id, ideaThoughts.ideaId)).where(eq(ideaThoughts.thoughtId, id)),
    db.select({ id: ideas.id, title: ideas.workingTitle }).from(ideas).where(isNull(ideas.archivedAt)).orderBy(desc(ideas.updatedAt)).limit(100),
  ]);
  const selectedIds = new Set(selected.map((s) => s.pillarId));
  const a = t.aiAnalysis;
  const ai = aiConfigured();
  const tx = transcriptionConfigured();

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-sm">
        <Link href="/studio/inbox" className="text-muted hover:text-ink">
          ← Inbox
        </Link>
      </p>
      <PageHeader eyebrow={`${SOURCE_LABELS[t.sourceType]} · ${t.createdAt.toLocaleString("en-CA")}`} title={t.title || "Untitled thought"}>
        <form action={createIdeaFromThoughtAction}>
          <input type="hidden" name="id" value={t.id} />
          <button className="btn">Turn into an idea →</button>
        </form>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Original (your words)</h2>
              <Badge>Never modified</Badge>
            </div>
            {t.originalContent ? (
              <div className="mt-3 whitespace-pre-wrap font-serif text-lg leading-relaxed">{t.originalContent}</div>
            ) : (
              <p className="mt-3 text-sm text-muted">No written text.</p>
            )}
            {t.sourceUrl && (
              <p className="mt-3 text-sm">
                <a href={t.sourceUrl} className="link break-all" target="_blank" rel="noopener noreferrer">
                  {t.sourceUrl}
                </a>
              </p>
            )}
            {t.audioAssetId && (
              <div className="mt-4">
                <audio controls preload="metadata" src={`/api/audio/${t.audioAssetId}`} className="w-full" />
              </div>
            )}
          </section>

          {t.audioAssetId && (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="eyebrow">Transcript</h2>
                <Badge tone={t.transcriptionStatus === "completed" ? "ok" : t.transcriptionStatus === "failed" ? "danger" : "warn"}>{t.transcriptionStatus}</Badge>
              </div>
              {t.transcriptionStatus === "pending" &&
                (nowMs() - t.updatedAt.getTime() < 5 * 60_000 ? (
                  <p className="mt-2 text-sm text-muted" role="status">
                    <AutoRefresh /> Transcribing… this page updates on its own.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-warn">Transcription seems stuck. Try again below.</p>
                ))}
              {t.transcriptionError && <p className="mt-2 text-sm text-danger">{t.transcriptionError}</p>}
              {t.transcription ? (
                <p className="mt-3 whitespace-pre-wrap font-serif text-lg leading-relaxed text-ink-soft">{t.transcription}</p>
              ) : (
                <p className="mt-3 text-sm text-muted">{tx.ok ? "Not transcribed yet." : `Transcription isn't configured (${tx.problem}). The recording is saved and you can transcribe it later.`}</p>
              )}
              {tx.ok && (
                <ActionForm action={transcribeAction} hidden={{ id: t.id }} submitLabel={t.transcription ? "Re-transcribe" : "Transcribe now"} pendingLabel="Transcribing…" buttonClassName="btn btn-ghost btn-sm" className="mt-3" />
              )}
            </section>
          )}

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="eyebrow">AI analysis (interpretation, editable)</h2>
              {a?.editedByFounder && <Badge tone="accent">Edited by you</Badge>}
            </div>
            {t.privacy === "sensitive" ? (
              <p className="mt-3 text-sm text-muted">This thought is marked sensitive and is never sent to the AI.</p>
            ) : !ai ? (
              <p className="mt-3 text-sm text-muted">Add an ANTHROPIC_API_KEY to enable analysis. Everything else works without it.</p>
            ) : (
              <ActionForm action={analyzeThoughtAction} hidden={{ id: t.id }} submitLabel={a ? "Re-analyse" : "Analyse this thought"} pendingLabel="Thinking…" buttonClassName="btn btn-ghost btn-sm" className="mt-3" confirmMessage={a?.editedByFounder ? "This replaces your edited analysis. The original note is untouched. Continue?" : undefined} />
            )}
            {a && (
              <ActionForm action={saveAnalysisAction} hidden={{ id: t.id }} submitLabel="Save analysis" buttonClassName="btn btn-ghost btn-sm" className="mt-5 space-y-3">
                {(
                  [
                    ["centralIdea", "Central idea", a.centralIdea],
                    ["underlyingBelief", "Underlying belief", a.underlyingBelief],
                    ["potentialContradiction", "Potential contradiction", a.potentialContradiction],
                    ["personalRelevance", "Personal relevance", a.personalRelevance],
                    ["editorialAngle", "Possible editorial angle", a.editorialAngle],
                  ] as const
                ).map(([name, label, value]) => (
                  <div key={name}>
                    <label className="field-label" htmlFor={name}>
                      {label}
                    </label>
                    <textarea id={name} name={name} defaultValue={value} rows={2} className="input text-sm" />
                  </div>
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="questionsToExplore">
                      Questions worth exploring (one per line)
                    </label>
                    <textarea id="questionsToExplore" name="questionsToExplore" defaultValue={a.questionsToExplore.join("\n")} rows={4} className="input text-sm" />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="relatedIdeas">
                      Related ideas (one per line)
                    </label>
                    <textarea id="relatedIdeas" name="relatedIdeas" defaultValue={a.relatedIdeas.join("\n")} rows={4} className="input text-sm" />
                  </div>
                </div>
                <input type="hidden" name="suggestedPillars" value={a.suggestedPillars.join("\n")} />
              </ActionForm>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="eyebrow">Details</h2>
            <ActionForm action={updateThoughtAction} hidden={{ id: t.id }} submitLabel="Save" buttonClassName="btn btn-ghost btn-sm" className="mt-3 space-y-3">
              <div>
                <label className="field-label" htmlFor="title">
                  Title
                </label>
                <input id="title" name="title" defaultValue={t.title ?? ""} className="input" />
              </div>
              <div>
                <label className="field-label" htmlFor="tags">
                  Tags
                </label>
                <input id="tags" name="tags" defaultValue={t.tags.join(", ")} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="status">
                    Status
                  </label>
                  <select id="status" name="status" defaultValue={t.status} className="input">
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="used">Used</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="privacy">
                    Privacy
                  </label>
                  <select id="privacy" name="privacy" defaultValue={t.privacy} className="input">
                    <option value="private">Private</option>
                    <option value="sensitive">Sensitive</option>
                    <option value="shareable">Shareable</option>
                  </select>
                </div>
              </div>
              <fieldset>
                <legend className="field-label">Pillars</legend>
                <div className="space-y-1">
                  {pillars.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="pillars" value={p.id} defaultChecked={selectedIds.has(p.id)} className="accent-[#7a5c34]" />
                      {p.name}
                      {a?.suggestedPillars.includes(p.slug) && !selectedIds.has(p.id) && <span className="text-xs text-bronze">(suggested)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
              {t.audioAssetId && t.transcription !== null && (
                <div>
                  <label className="field-label" htmlFor="transcription">
                    Correct the transcript
                  </label>
                  <textarea id="transcription" name="transcription" defaultValue={t.transcription ?? ""} rows={5} className="input text-sm" />
                  <p className="field-hint">The audio recording itself is always kept unchanged.</p>
                </div>
              )}
            </ActionForm>
          </section>

          <section className="card p-5">
            <h2 className="eyebrow">Ideas</h2>
            {linked.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {linked.map((l) => (
                  <li key={l.id}>
                    <Link href={`/studio/ideas/${l.id}`} className="link">
                      {l.title}
                    </Link>{" "}
                    <span className="text-muted">· {stageLabel(l.stage)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Not linked to any idea yet.</p>
            )}
            <ActionForm action={linkThoughtToIdeaAction} hidden={{ id: t.id }} submitLabel="Link" buttonClassName="btn btn-ghost btn-sm" className="mt-4 space-y-2">
              <label className="field-label" htmlFor="ideaId">
                Add to an existing idea
              </label>
              <select id="ideaId" name="ideaId" className="input">
                <option value="">Choose…</option>
                {openIdeas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </select>
            </ActionForm>
          </section>
        </aside>
      </div>
    </div>
  );
}
