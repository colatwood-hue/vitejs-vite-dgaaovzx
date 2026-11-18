import Link from "next/link";
import { aiStageAction, applyFinalAction, directionAction, selectAngleAction, setAiStageAction } from "@/actions/ai";
import { aiConfigured } from "@/lib/ai/client";
import { getOrCreateSession, MAX_INTERVIEW_ROUNDS, sessionMessages, type Angle, type FinalPackage } from "@/lib/ai/editorial";
import { renderMarkdown } from "@/lib/markdown";
import { ActionForm } from "./ActionForm";
import { AnswerForm } from "./AnswerForm";
import { Badge } from "./ui";

const STEPS = [
  ["understand", "Understand"],
  ["interview", "Interview"],
  ["angles", "Angle"],
  ["draft", "Draft"],
  ["critique", "Critique"],
  ["finalize", "Finalize"],
] as const;

const ANGLE_FIELDS: [keyof Angle, string, number][] = [
  ["title", "Working title", 1],
  ["thesis", "Central thesis", 2],
  ["readerRelevance", "Why a reader should care", 2],
  ["potentialOpening", "Potential opening", 3],
  ["supportingStory", "Supporting story (yours)", 2],
  ["strongestCounterargument", "Strongest counterargument", 2],
  ["closingReflection", "Closing reflection", 2],
];

function AngleForm({ ideaId, angle, label }: { ideaId: string; angle?: Partial<Angle>; label: string }) {
  return (
    <ActionForm action={selectAngleAction} hidden={{ ideaId }} submitLabel={label} buttonClassName="btn btn-sm" className="space-y-2">
      {ANGLE_FIELDS.map(([k, l, rows]) =>
        rows === 1 ? (
          <div key={k}>
            <label className="field-label">{l}</label>
            <input name={k} defaultValue={angle?.[k] ?? ""} className="input text-sm" />
          </div>
        ) : (
          <div key={k}>
            <label className="field-label">{l}</label>
            <textarea name={k} defaultValue={angle?.[k] ?? ""} rows={rows} className="input text-sm" />
          </div>
        ),
      )}
    </ActionForm>
  );
}

export async function AIStudio({ ideaId, issueId }: { ideaId: string; issueId: string | null }) {
  const configured = aiConfigured();
  const session = await getOrCreateSession(ideaId);
  const messages = await sessionMessages(session.id);
  const stageIdx = STEPS.findIndex(([k]) => k === session.stage);
  const lastQuestions = [...messages].reverse().find((m) => m.kind === "questions");
  const lastAngles = [...messages].reverse().find((m) => m.kind === "angles");
  const lastFinal = [...messages].reverse().find((m) => m.kind === "final");
  const hasDraft = messages.some((m) => m.kind === "draft") || !!issueId;

  const run = (stage: string, label: string, pendingLabel = "Thinking…", ghost = false) => (
    <ActionForm action={aiStageAction} hidden={{ ideaId, stage }} submitLabel={label} pendingLabel={pendingLabel} buttonClassName={`btn btn-sm ${ghost ? "btn-ghost" : ""}`} />
  );

  return (
    <section className="card" aria-labelledby="ai-studio">
      <header className="border-b border-rule p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ai-studio" className="font-serif text-2xl">
            Editorial partner
          </h2>
          {!configured && <Badge tone="warn">AI not configured</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted">Interviewer, thinking partner and critical editor. It never invents your experiences; gaps become [COL: …] placeholders.</p>
        <ol className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {STEPS.map(([k, label], i) => (
            <li key={k}>
              <form action={setAiStageAction}>
                <input type="hidden" name="ideaId" value={ideaId} />
                <input type="hidden" name="stage" value={k} />
                <button
                  className={`rounded-full border px-2.5 py-1 ${i === stageIdx ? "border-ink bg-ink text-paper" : i < stageIdx || session.stage === "done" ? "border-bronze/40 text-bronze" : "border-rule text-muted"}`}
                  aria-current={i === stageIdx ? "step" : undefined}
                >
                  {i + 1}. {label}
                </button>
              </form>
            </li>
          ))}
        </ol>
      </header>

      {!configured ? (
        <p className="p-5 text-sm text-ink-soft">
          Add <code>ANTHROPIC_API_KEY</code> to your environment to use the editorial partner. You can still develop this idea by hand and write the issue in the editor.
        </p>
      ) : (
        <>
          {messages.length > 0 && (
            <ol className="max-h-[36rem] space-y-4 overflow-y-auto p-4 sm:p-5" aria-label="Conversation">
              {messages.map((m) => (
                <li key={m.id} className={m.role === "founder" ? "ml-6 sm:ml-12" : ""}>
                  <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-wider text-muted">
                    {m.role === "founder" ? "You (your words)" : m.role === "assistant" ? `AI · ${m.kind}` : "Note"}
                  </p>
                  <div className={`rounded-sm p-3 ${m.role === "founder" ? "border border-bronze/30 bg-bronze/5 font-serif text-[1.02rem] leading-relaxed" : "bg-paper prose-ui"}`}>
                    {m.role === "founder" ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="space-y-4 border-t border-rule p-4 sm:p-5">
            {session.stage === "understand" && (
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">Start by letting the AI read your notes and say back what it thinks you&rsquo;re getting at, including what&rsquo;s missing.</p>
                {run("understand", "Help me understand this idea")}
              </div>
            )}

            {session.stage === "interview" && (
              <div className="space-y-4">
                {lastQuestions && <AnswerForm ideaId={ideaId} />}
                <div className="flex flex-wrap gap-2">
                  {session.interviewRounds < MAX_INTERVIEW_ROUNDS
                    ? run("interview", lastQuestions ? "Ask me more questions" : "Interview me", "Thinking of questions…", !!lastQuestions)
                    : <p className="text-xs text-muted">Interview limit reached ({MAX_INTERVIEW_ROUNDS} rounds). Time to choose an angle.</p>}
                  {run("angles", "Propose angles →", "Developing angles…", true)}
                </div>
              </div>
            )}

            {session.stage === "angles" && (
              <div className="space-y-4">
                {lastAngles ? (
                  <div className="grid gap-3 xl:grid-cols-3">
                    {((lastAngles.data as { angles: Angle[] }).angles ?? []).map((a, i) => (
                      <details key={i} className="rounded-sm border border-rule bg-paper p-3" open={i === 0}>
                        <summary className="cursor-pointer font-serif text-lg leading-snug">{a.title}</summary>
                        <div className="mt-3">
                          <AngleForm ideaId={ideaId} angle={a} label="Use this angle" />
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  run("angles", "Propose angles", "Developing angles…")
                )}
                <details className="rounded-sm border border-dashed border-rule p-3">
                  <summary className="cursor-pointer text-sm">Write my own angle</summary>
                  <div className="mt-3">
                    <AngleForm ideaId={ideaId} label="Use my angle" />
                  </div>
                </details>
                {lastAngles && run("angles", "Try different angles", "Developing angles…", true)}
              </div>
            )}

            {session.stage === "draft" && (
              <div className="space-y-2">
                {session.selectedAngle ? (
                  <>
                    <p className="text-sm text-ink-soft">
                      Angle: <strong>{(session.selectedAngle as { title?: string }).title}</strong>. The draft goes straight into the issue editor (your previous text is saved in history).
                    </p>
                    {run("draft", hasDraft ? "Write a new draft" : "Write the first draft", "Drafting (this can take a minute)…")}
                  </>
                ) : (
                  <p className="text-sm text-muted">Choose an angle first.</p>
                )}
              </div>
            )}

            {session.stage === "critique" && (
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">
                  Edit the draft in the{" "}
                  {issueId ? (
                    <Link href={`/studio/issues/${issueId}`} className="link">
                      issue editor
                    </Link>
                  ) : (
                    "issue editor"
                  )}{" "}
                  as much as you like, then ask for a critical edit of the current version.
                </p>
                {run("critique", "Critique my current draft", "Reading critically…")}
              </div>
            )}

            {session.stage === "finalize" && (
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">Prepares a final version, subject lines, preview text and excerpts. Nothing changes until you apply it, and nothing is sent until you approve.</p>
                <div className="flex flex-wrap gap-2">
                  {run("finalize", "Prepare final version", "Finalizing…")}
                  {run("critique", "Critique again", "Reading critically…", true)}
                </div>
              </div>
            )}

            {lastFinal && (session.stage === "finalize" || session.stage === "done") && <FinalProposal ideaId={ideaId} messageId={lastFinal.id} data={lastFinal.data as FinalPackage} />}

            {session.stage === "done" && (
              <p className="text-sm text-ink-soft">
                Final version applied.{" "}
                {issueId && (
                  <Link href={`/studio/issues/${issueId}`} className="link">
                    Review and approve it in the editor →
                  </Link>
                )}
              </p>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Give the AI direction</summary>
              <ActionForm action={directionAction} hidden={{ ideaId }} submitLabel="Add note" buttonClassName="btn btn-ghost btn-sm" className="mt-2 space-y-2" resetOnSuccess>
                <textarea name="note" rows={2} className="input text-sm" placeholder="e.g. Don't make this about business. Keep the ending unresolved." />
              </ActionForm>
            </details>
          </div>
        </>
      )}
    </section>
  );
}

function FinalProposal({ ideaId, messageId, data }: { ideaId: string; messageId: string; data: FinalPackage }) {
  return (
    <div className="space-y-4 rounded-sm border border-bronze/30 bg-paper p-4">
      <h3 className="font-serif text-xl">Proposed final version</h3>
      <div className="prose-dash max-h-96 overflow-y-auto border-y border-rule py-3 text-base" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.finalBody) }} />
      {data.closing && (
        <div className="text-sm">
          <p className="eyebrow">Closing</p>
          <div className="prose-ui" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.closing) }} />
        </div>
      )}
      <ActionForm action={applyFinalAction} hidden={{ ideaId, messageId }} submitLabel="Apply to editor" pendingLabel="Applying…" className="space-y-3" confirmMessage="Replace the editor content with this final version? The current text is saved in version history.">
        <fieldset>
          <legend className="field-label">Subject line</legend>
          {data.subjectLines.map((s, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" name="subjectIndex" value={i} defaultChecked={i === 0} className="accent-[#7a5c34]" /> {s}
            </label>
          ))}
        </fieldset>
        <p className="text-sm">
          <span className="text-muted">Preview text:</span> {data.previewText}
        </p>
      </ActionForm>
      {data.socialExcerpts.length > 0 && (
        <div className="text-sm">
          <p className="eyebrow">Social excerpts</p>
          <ul className="prose-ui">
            {data.socialExcerpts.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {data.followUpIdeas.length > 0 && (
        <div className="text-sm">
          <p className="eyebrow">Follow-up ideas</p>
          <ul className="prose-ui">
            {data.followUpIdeas.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
