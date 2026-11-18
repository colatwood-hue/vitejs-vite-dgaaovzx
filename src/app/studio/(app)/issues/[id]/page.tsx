import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, engagementEvents, issueRevisions, issues, readerFeedback, repurposedContent, sendEvents } from "@/db/schema";
import { allPillars } from "@/lib/pillars";
import { getSettings, senderComplianceGaps } from "@/lib/settings";
import { isApprovalCurrent, publishChecklist } from "@/lib/issues";
import { broadcastPreflight } from "@/lib/campaigns";
import { aiConfigured } from "@/lib/ai/client";
import { REPURPOSE_FORMATS } from "@/lib/ai/prompts";
import { issueLabel } from "@/lib/email/templates";
import {
  addFeedbackAction,
  approveAction,
  cancelCampaignAction,
  deleteIssueAction,
  deleteRepurposedAction,
  publishWebAction,
  retryCampaignAction,
  revokeApprovalAction,
  saveRepurposedAction,
  sendTestAction,
  unpublishAction,
} from "@/actions/issues";
import { repurposeAction } from "@/actions/ai";
import { IssueEditor } from "@/components/studio/IssueEditor";
import { BroadcastForm } from "@/components/studio/BroadcastForm";
import { ActionForm } from "@/components/studio/ActionForm";
import { Badge, PageHeader, issueStatusTone, relTime } from "@/components/studio/ui";

export const maxDuration = 300;

const REPURPOSE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn reflection",
  short_post: "Short social post",
  instagram: "Instagram caption",
  video_script: "30–60s video script",
  quote_card: "Quote card copy",
  discussion_prompt: "Discussion prompt",
  essay_outline: "Longer essay outline",
  future_ideas: "Future newsletter ideas",
};

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [issue] = await db.select().from(issues).where(eq(issues.id, id));
  if (!issue) notFound();

  const [pillars, settings, revisions, camps, derivatives, feedback] = await Promise.all([
    allPillars(),
    getSettings(),
    db.select({ id: issueRevisions.id, source: issueRevisions.source, note: issueRevisions.note, createdAt: issueRevisions.createdAt }).from(issueRevisions).where(eq(issueRevisions.issueId, id)).orderBy(desc(issueRevisions.createdAt)).limit(40),
    db.select().from(campaigns).where(eq(campaigns.issueId, id)).orderBy(desc(campaigns.createdAt)),
    db.select().from(repurposedContent).where(eq(repurposedContent.issueId, id)).orderBy(desc(repurposedContent.createdAt)),
    db.select().from(readerFeedback).where(eq(readerFeedback.issueId, id)).orderBy(desc(readerFeedback.createdAt)),
  ]);
  const campIds = camps.map((c) => c.id);
  const [sendStats, engStats, failures] = campIds.length
    ? await Promise.all([
        db.select({ campaignId: sendEvents.campaignId, status: sendEvents.status, n: sql<number>`count(*)::int` }).from(sendEvents).where(inArray(sendEvents.campaignId, campIds)).groupBy(sendEvents.campaignId, sendEvents.status),
        db.select({ campaignId: engagementEvents.campaignId, type: engagementEvents.type, n: sql<number>`count(*)::int` }).from(engagementEvents).where(inArray(engagementEvents.campaignId, campIds)).groupBy(engagementEvents.campaignId, engagementEvents.type),
        db.select().from(sendEvents).where(and(inArray(sendEvents.campaignId, campIds), inArray(sendEvents.status, ["failed", "bounced", "complained", "skipped"]))).limit(50),
      ])
    : [[], [], []];

  const testSent = camps.some((c) => c.kind === "test" && ["sent", "partially_failed"].includes(c.status));
  const gaps = senderComplianceGaps(settings);
  const checklist = publishChecklist(issue, { senderGaps: gaps, testSent });
  const approved = isApprovalCurrent(issue);
  const pre = approved ? await broadcastPreflight(id) : null;
  const liveBroadcast = camps.find((c) => c.kind === "broadcast" && c.status !== "cancelled");
  const ai = aiConfigured();

  return (
    <div className="mx-auto max-w-7xl">
      <p className="mb-2 text-sm">
        <Link href="/studio/issues" className="text-muted hover:text-ink">
          ← Issues
        </Link>
        {issue.ideaId && (
          <>
            {" · "}
            <Link href={`/studio/ideas/${issue.ideaId}`} className="text-muted hover:text-ink">
              Idea & editorial partner
            </Link>
          </>
        )}
      </p>
      <PageHeader eyebrow={issueLabel(issue.number)} title={issue.title || "Untitled"}>
        <Badge tone={issueStatusTone(issue.status)}>{issue.status}</Badge>
        {issue.publishedAt && (
          <Link href={`/issues/${issue.slug}`} target="_blank" className="btn btn-ghost btn-sm">
            View live ↗
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <IssueEditor
          issue={{
            id: issue.id,
            title: issue.title,
            subtitle: issue.subtitle,
            bodyMd: issue.bodyMd,
            recommendationMd: issue.recommendationMd,
            closingMd: issue.closingMd,
            subject: issue.subject,
            previewText: issue.previewText,
            slug: issue.slug,
            number: issue.number,
            primaryPillarId: issue.primaryPillarId,
            secondaryThemes: issue.secondaryThemes,
            readingMinutes: issue.readingMinutes,
            status: issue.status,
            published: !!issue.publishedAt,
          }}
          pillars={pillars.map((p) => ({ id: p.id, name: p.name }))}
        />

        <aside className="space-y-5">
          {/* Checklist */}
          <section className="card p-4" aria-labelledby="checklist">
            <h2 id="checklist" className="eyebrow">
              Publishing checklist
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  <span aria-hidden="true" className={c.ok ? "text-ok" : c.optional ? "text-muted" : "text-warn"}>
                    {c.ok ? "✓" : "○"}
                  </span>
                  <span className={c.ok ? "text-ink-soft" : ""}>
                    {c.label}
                    {c.optional && !c.ok && <span className="text-muted"> (optional)</span>}
                    <span className="sr-only">{c.ok ? " (done)" : " (not done)"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {gaps.length > 0 && (
              <p className="mt-3 text-xs text-warn">
                {gaps.join(" ")}{" "}
                <Link href="/studio/settings" className="link">
                  Fix in settings
                </Link>
              </p>
            )}
          </section>

          {/* Test */}
          <section className="card p-4" aria-labelledby="test-send">
            <h2 id="test-send" className="eyebrow">
              1 · Send a test
            </h2>
            <ActionForm action={sendTestAction} hidden={{ id }} submitLabel="Send test" pendingLabel="Sending…" buttonClassName="btn btn-ghost btn-sm" className="mt-3 space-y-2">
              <label htmlFor="emails" className="field-label">
                Send to
              </label>
              <input id="emails" name="emails" defaultValue={settings.contactEmail || settings.replyToEmail} className="input text-sm" placeholder="you@example.com" />
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" name="includeTestList" defaultChecked className="accent-[#7a5c34]" /> Also my saved test recipients
              </label>
            </ActionForm>
          </section>

          {/* Approve */}
          <section className="card p-4" aria-labelledby="approve">
            <h2 id="approve" className="eyebrow">
              2 · Approve the final version
            </h2>
            {approved ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-ok">Approved {relTime(issue.approvedAt!)}. Any edit removes approval.</p>
                {!liveBroadcast && !issue.publishedAt && (
                  <form action={revokeApprovalAction}>
                    <input type="hidden" name="id" value={id} />
                    <button className="text-xs text-muted underline">Withdraw approval</button>
                  </form>
                )}
              </div>
            ) : (
              <ActionForm action={approveAction} hidden={{ id }} submitLabel="Approve this version" buttonClassName="btn btn-sm" className="mt-3" confirmMessage="Approve exactly what's in the editor now as the final version?">
                <p className="mb-2 text-xs text-muted">Read the preview first. Approval locks in this exact text for sending and publishing.</p>
              </ActionForm>
            )}
          </section>

          {/* Publish web */}
          <section className="card p-4" aria-labelledby="web">
            <h2 id="web" className="eyebrow">
              3 · Publish to the archive
            </h2>
            {issue.publishedAt ? (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  Live since {issue.publishedAt.toLocaleDateString("en-CA")} at{" "}
                  <Link href={`/issues/${issue.slug}`} className="link" target="_blank">
                    /issues/{issue.slug}
                  </Link>
                </p>
                <form action={unpublishAction}>
                  <input type="hidden" name="id" value={id} />
                  <button className="text-xs text-muted underline">Unpublish from website</button>
                </form>
              </div>
            ) : (
              <ActionForm action={publishWebAction} hidden={{ id }} submitLabel="Publish to website" buttonClassName="btn btn-sm" className="mt-3" confirmMessage="Publish this issue on the public website?">
                {!approved && <p className="mb-2 text-xs text-muted">Approve first.</p>}
              </ActionForm>
            )}
          </section>

          {/* Broadcast */}
          <section className="card p-4" aria-labelledby="send">
            <h2 id="send" className="eyebrow">
              4 · Send to subscribers
            </h2>
            <div className="mt-3">
              {liveBroadcast ? (
                <p className="text-sm">
                  Broadcast {liveBroadcast.status}
                  {liveBroadcast.status === "scheduled" && liveBroadcast.scheduledFor ? ` for ${liveBroadcast.scheduledFor.toLocaleString("en-CA")}` : ""}. See the send log below.
                </p>
              ) : !pre ? (
                <p className="text-sm text-muted">Approve the final version to unlock sending.</p>
              ) : pre.problems.length ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-warn">
                  {pre.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <BroadcastForm issueId={id} recipientCount={pre.recipientCount} simulated={pre.simulated} provider={pre.provider} />
              )}
            </div>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="eyebrow">Export</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn btn-ghost btn-sm" href={`/studio/issues/${id}/export?format=md`}>
                Markdown
              </a>
              <a className="btn btn-ghost btn-sm" href={`/studio/issues/${id}/export?format=html`}>
                HTML
              </a>
              <a className="btn btn-ghost btn-sm" href={`/studio/issues/${id}/export?format=email`}>
                Email HTML
              </a>
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Send log */}
        <section className="card p-4 sm:p-5" aria-labelledby="sendlog">
          <h2 id="sendlog" className="eyebrow">
            Send log
          </h2>
          {camps.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing sent yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule text-sm">
              {camps.map((c) => {
                const s = Object.fromEntries(sendStats.filter((x) => x.campaignId === c.id).map((x) => [x.status, x.n]));
                const e = Object.fromEntries(engStats.filter((x) => x.campaignId === c.id).map((x) => [x.type, x.n]));
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={c.kind === "test" ? "neutral" : "accent"}>{c.kind}</Badge>
                      <Badge tone={c.status === "sent" ? "ok" : c.status.includes("fail") ? "danger" : "neutral"}>{c.status}</Badge>
                      <span className="text-xs text-muted">
                        {c.provider} · {c.createdAt.toLocaleString("en-CA")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {c.recipientCount} recipient(s)
                      {Object.entries(s).map(([k, v]) => ` · ${v} ${k}`)}
                      {Object.entries(e).map(([k, v]) => ` · ${v} ${k}`)}
                    </p>
                    {c.provider === "console" && <p className="mt-1 text-xs text-warn">Simulated: no email was delivered.</p>}
                    {c.lastError && <p className="mt-1 text-xs text-danger">{c.lastError}</p>}
                    {c.confirmationNote && <p className="mt-1 text-xs text-muted">{c.confirmationNote}</p>}
                    <div className="mt-2 flex gap-3">
                      {c.status === "scheduled" && (
                        <form action={cancelCampaignAction}>
                          <input type="hidden" name="campaignId" value={c.id} />
                          <button className="text-xs text-danger underline">Cancel</button>
                        </form>
                      )}
                      {c.status === "sending" && (
                        <form action={retryCampaignAction}>
                          <input type="hidden" name="campaignId" value={c.id} />
                          <button className="text-xs underline">Continue sending</button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {failures.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-danger">{failures.length} problem recipient(s)</summary>
              <ul className="mt-2 space-y-1">
                {failures.map((f) => (
                  <li key={f.id}>
                    {f.email}: {f.status}
                    {f.lastError ? `: ${f.lastError}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Revisions */}
        <section className="card p-4 sm:p-5" aria-labelledby="history">
          <h2 id="history" className="eyebrow">
            Version history
          </h2>
          {revisions.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Versions appear as you write (autosave snapshots every 10 minutes, plus every manual save, AI draft and approval).</p>
          ) : (
            <ul className="mt-3 max-h-80 divide-y divide-rule overflow-y-auto text-sm">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <Badge tone={r.source.startsWith("ai") ? "accent" : "neutral"}>{r.source.replace("_", " ")}</Badge> <span className="text-xs text-muted">{r.createdAt.toLocaleString("en-CA")}</span>
                    {r.note && <span className="block text-xs text-ink-soft">{r.note}</span>}
                  </span>
                  <Link href={`/studio/issues/${id}/revisions/${r.id}`} className="text-xs text-bronze underline">
                    Compare
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Repurposing */}
        <section className="card p-4 sm:p-5 lg:col-span-2" aria-labelledby="repurpose">
          <h2 id="repurpose" className="eyebrow">
            Repurpose
          </h2>
          <p className="mt-1 text-xs text-muted">Derivatives stay linked to this issue and are never posted anywhere automatically. Best generated from the approved version.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(REPURPOSE_FORMATS).map((k) =>
              ai ? (
                <ActionForm key={k} action={repurposeAction} hidden={{ issueId: id, kind: k }} submitLabel={REPURPOSE_LABELS[k]} pendingLabel="Writing…" buttonClassName="btn btn-ghost btn-sm" />
              ) : null,
            )}
          </div>
          {!ai && <p className="mt-2 text-xs text-muted">AI isn&rsquo;t configured. You can still write derivatives by hand below.</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {derivatives.map((d) => (
              <div key={d.id} className="rounded-sm border border-rule bg-paper p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    {REPURPOSE_LABELS[d.kind] ?? d.kind} {d.generatedBy === "ai" && <Badge tone="accent">AI draft</Badge>}
                  </span>
                  <form action={deleteRepurposedAction}>
                    <input type="hidden" name="rid" value={d.id} />
                    <input type="hidden" name="issueId" value={id} />
                    <button className="text-muted hover:text-danger">Delete</button>
                  </form>
                </div>
                <ActionForm action={saveRepurposedAction} hidden={{ rid: d.id, issueId: id }} submitLabel="Save" buttonClassName="btn btn-ghost btn-sm" className="space-y-2">
                  <textarea name="content" defaultValue={d.content} rows={8} className="input text-sm" aria-label={`${REPURPOSE_LABELS[d.kind] ?? d.kind} content`} />
                </ActionForm>
              </div>
            ))}
            <div className="rounded-sm border border-dashed border-rule p-3">
              <ActionForm action={saveRepurposedAction} hidden={{ issueId: id }} submitLabel="Add" buttonClassName="btn btn-ghost btn-sm" className="space-y-2" resetOnSuccess>
                <label className="field-label" htmlFor="new-kind">
                  Write one by hand
                </label>
                <select id="new-kind" name="kind" className="input text-sm">
                  {Object.entries(REPURPOSE_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <textarea name="content" rows={4} className="input text-sm" aria-label="Content" />
              </ActionForm>
            </div>
          </div>
        </section>

        {/* Feedback */}
        <section className="card p-4 sm:p-5 lg:col-span-2" aria-labelledby="fb">
          <h2 id="fb" className="eyebrow">
            Reader responses to this issue
          </h2>
          {feedback.length > 0 && (
            <ul className="mt-3 space-y-2">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-sm bg-paper p-3 text-sm">
                  <span className="text-xs text-muted">
                    {f.kind}
                    {f.fromName ? ` · ${f.fromName}` : ""} · {f.createdAt.toLocaleDateString("en-CA")}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap font-serif">{f.content}</p>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addFeedbackAction} hidden={{ issueId: id }} submitLabel="Log response" buttonClassName="btn btn-ghost btn-sm" className="mt-3 grid gap-2 sm:grid-cols-[10rem_12rem_1fr]" resetOnSuccess>
            <select name="kind" className="input text-sm" aria-label="Type">
              <option value="response">Reader response</option>
              <option value="conversation">Conversation</option>
              <option value="question">Question received</option>
              <option value="idea">Idea sparked</option>
              <option value="revisit">Revisit this topic</option>
            </select>
            <input name="fromName" placeholder="From (first name only)" className="input text-sm" aria-label="From" />
            <textarea name="content" rows={2} className="input text-sm sm:col-span-3" aria-label="What they said" placeholder="What they said, or what it sparked" />
          </ActionForm>
        </section>
      </div>

      {!issue.publishedAt && !liveBroadcast && (
        <form action={deleteIssueAction} className="mt-8 text-right">
          <input type="hidden" name="id" value={id} />
          <button className="text-xs text-muted hover:text-danger">Delete this draft</button>
        </form>
      )}
    </div>
  );
}
