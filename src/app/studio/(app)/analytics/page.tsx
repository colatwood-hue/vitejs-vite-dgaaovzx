import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { nowMs } from "@/lib/time";
import { campaigns, consentRecords, engagementEvents, issues, pageViews, readerFeedback, sendEvents, subscribers } from "@/db/schema";
import { addFeedbackAction, toggleFeedbackFollowUpAction } from "@/actions/issues";
import { getEmailProvider } from "@/lib/email";
import { ActionForm } from "@/components/studio/ActionForm";
import { Badge, PageHeader, Stat } from "@/components/studio/ui";

export const metadata = { title: "Analytics & Feedback" };

const DAY = 86400_000;

export default async function Analytics({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const since30 = new Date(nowMs() - 30 * DAY);
  const provider = getEmailProvider();

  const [
    [active],
    [newSubs],
    [unsubs],
    [views],
    [subViews],
    [subSubmits],
    published,
    broadcasts,
    feedback,
    [feedbackCount],
    topPages,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(subscribers).where(eq(subscribers.status, "active")),
    db.select({ n: sql<number>`count(distinct ${consentRecords.subscriberId})::int` }).from(consentRecords).where(and(gte(consentRecords.createdAt, since30), sql`${consentRecords.action} in ('confirmed','granted','imported')`)),
    db.select({ n: sql<number>`count(*)::int` }).from(consentRecords).where(and(gte(consentRecords.createdAt, since30), eq(consentRecords.action, "withdrawn"))),
    db.select({ n: sql<number>`count(*)::int` }).from(pageViews).where(and(gte(pageViews.createdAt, since30), eq(pageViews.kind, "view"))),
    db.select({ n: sql<number>`count(*)::int` }).from(pageViews).where(and(gte(pageViews.createdAt, since30), eq(pageViews.kind, "subscribe_view"))),
    db.select({ n: sql<number>`count(*)::int` }).from(pageViews).where(and(gte(pageViews.createdAt, since30), eq(pageViews.kind, "subscribe_submit"))),
    db.select({ publishedAt: issues.publishedAt }).from(issues).where(isNotNull(issues.publishedAt)).orderBy(desc(issues.publishedAt)),
    db.select({ c: campaigns, title: issues.title }).from(campaigns).innerJoin(issues, eq(issues.id, campaigns.issueId)).where(eq(campaigns.kind, "broadcast")).orderBy(desc(campaigns.createdAt)).limit(12),
    db.select({ f: readerFeedback, title: issues.title, issueId: issues.id }).from(readerFeedback).leftJoin(issues, eq(issues.id, readerFeedback.issueId)).where(kind === "followup" ? eq(readerFeedback.followUp, true) : kind ? eq(readerFeedback.kind, kind) : undefined).orderBy(desc(readerFeedback.createdAt)).limit(100),
    db.select({ n: sql<number>`count(*)::int` }).from(readerFeedback),
    db.select({ path: pageViews.path, n: sql<number>`count(*)::int` }).from(pageViews).where(and(gte(pageViews.createdAt, since30), eq(pageViews.kind, "view"))).groupBy(pageViews.path).orderBy(desc(sql`count(*)`)).limit(8),
  ]);

  const campIds = broadcasts.map((b) => b.c.id);
  const [sendStats, eng] = campIds.length
    ? await Promise.all([
        db.select({ id: sendEvents.campaignId, status: sendEvents.status, n: sql<number>`count(*)::int` }).from(sendEvents).where(inArray(sendEvents.campaignId, campIds)).groupBy(sendEvents.campaignId, sendEvents.status),
        db.select({ id: engagementEvents.campaignId, type: engagementEvents.type, n: sql<number>`count(distinct ${engagementEvents.sendEventId})::int` }).from(engagementEvents).where(inArray(engagementEvents.campaignId, campIds)).groupBy(engagementEvents.campaignId, engagementEvents.type),
      ])
    : [[], []];

  // Publishing consistency: issues per month, last 6 months.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-CA", { month: "short", year: "2-digit" }), n: 0 };
  });
  for (const p of published) {
    const m = months.find((x) => x.key === `${p.publishedAt!.getFullYear()}-${p.publishedAt!.getMonth()}`);
    if (m) m.n++;
  }
  const gaps = published.slice(0, -1).map((p, i) => (p.publishedAt!.getTime() - published[i + 1].publishedAt!.getTime()) / DAY);
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const daysSinceLast = published[0] ? Math.floor((nowMs() - published[0].publishedAt!.getTime()) / DAY) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Learning" title="Analytics & Feedback" description="Only real data is shown. Where a provider isn't connected, the number is marked unavailable rather than estimated." />

      <h2 className="eyebrow mb-3">Audience · last 30 days</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active subscribers" value={active.n} />
        <Stat label="New subscribers" value={newSubs.n} note="confirmed, added or imported" />
        <Stat label="Unsubscribes" value={unsubs.n} />
        <Stat label="Reader feedback logged" value={feedbackCount.n} note="all time" />
      </div>

      <h2 className="eyebrow mb-3 mt-8">Website · last 30 days</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Page views" value={views.n} note="first-party, cookie-free" />
        <Stat label="Subscribe page views" value={subViews.n} />
        <Stat label="Signup form submissions" value={subSubmits.n} note="all forms" />
        <Stat label="Subscribe page conversion" value={subViews.n ? `${Math.round((Math.min(subSubmits.n, subViews.n) / subViews.n) * 100)}%` : "—"} note="submissions ÷ subscribe page views (approximate)" />
      </div>
      {topPages.length > 0 && (
        <ul className="card mt-3 divide-y divide-rule text-sm">
          {topPages.map((p) => (
            <li key={p.path} className="flex justify-between px-4 py-2">
              <span className="truncate">{p.path}</span>
              <span className="tabular-nums text-muted">{p.n}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="eyebrow mb-3 mt-8">Publishing consistency</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Issues published" value={published.length} />
          <Stat label="Days since last issue" value={daysSinceLast ?? "—"} note={avgGap ? `avg ${avgGap} days between issues` : undefined} />
        </div>
        <table className="card w-full text-sm">
          <caption className="sr-only">Issues published per month</caption>
          <thead>
            <tr className="text-xs text-muted">
              {months.map((m) => (
                <th key={m.key} className="px-2 pt-3 font-normal">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {months.map((m) => (
                <td key={m.key} className="px-2 pb-3 text-center font-serif text-2xl tabular-nums">
                  {m.n}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="eyebrow mb-3 mt-8">Email delivery</h2>
      {!provider.capabilities.realDelivery && (
        <p className="mb-3 rounded-sm border border-[#e8d49a] bg-[#fff4d6] px-3 py-2 text-sm text-[#5c4a12]">
          No email provider is connected, so delivery, bounce, complaint and click data are unavailable. Sends shown below are simulated.
        </p>
      )}
      {broadcasts.length === 0 ? (
        <p className="text-sm text-muted">No broadcasts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-rule text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Issue</th>
                <th className="py-2 pr-3 font-medium">Recipients</th>
                <th className="py-2 pr-3 font-medium">Accepted</th>
                <th className="py-2 pr-3 font-medium">Delivered</th>
                <th className="py-2 pr-3 font-medium">Bounced</th>
                <th className="py-2 pr-3 font-medium">Complaints</th>
                <th className="py-2 pr-3 font-medium">Clicked</th>
                <th className="py-2 font-medium">Opened*</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {broadcasts.map(({ c, title }) => {
                const s = Object.fromEntries(sendStats.filter((x) => x.id === c.id).map((x) => [x.status, x.n]));
                const e = Object.fromEntries(eng.filter((x) => x.id === c.id).map((x) => [x.type, x.n]));
                const simulated = c.provider === "console";
                const na = <span className="text-muted">n/a</span>;
                return (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/studio/issues/${c.issueId}`} className="hover:text-bronze">
                        {title}
                      </Link>{" "}
                      {simulated && <Badge tone="warn">simulated</Badge>} <Badge>{c.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{c.recipientCount}</td>
                    <td className="py-2 pr-3 tabular-nums">{simulated ? na : (s.sent ?? 0) + (s.delivered ?? 0) + (s.bounced ?? 0) + (s.complained ?? 0)}</td>
                    <td className="py-2 pr-3 tabular-nums">{simulated ? na : e.delivered ?? 0}</td>
                    <td className="py-2 pr-3 tabular-nums">{simulated ? na : e.bounced ?? 0}</td>
                    <td className="py-2 pr-3 tabular-nums">{simulated ? na : e.complained ?? 0}</td>
                    <td className="py-2 pr-3 tabular-nums">{simulated ? na : e.clicked ?? 0}</td>
                    <td className="py-2 tabular-nums text-muted">{simulated ? na : e.opened ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            *Opens are directional only: Apple Mail Privacy Protection and image blocking make them unreliable. Delivery, bounce, complaint, click and open counts require provider webhooks (see setup guide). Replies and conversations below are the real signal.
          </p>
        </div>
      )}

      <section className="mt-10" aria-labelledby="feedback-log">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3">
          <h2 id="feedback-log" className="font-serif text-2xl">
            Feedback log
          </h2>
          <nav className="flex flex-wrap gap-1.5 text-xs" aria-label="Filter feedback">
            {[
              ["", "All"],
              ["response", "Responses"],
              ["conversation", "Conversations"],
              ["question", "Questions"],
              ["idea", "Ideas sparked"],
              ["revisit", "Revisit"],
              ["followup", "Follow up"],
            ].map(([k, l]) => (
              <Link key={k} href={k ? `?kind=${k}` : "?"} className={`chip ${kind === k || (!kind && !k) ? "border-ink text-ink" : ""}`}>
                {l}
              </Link>
            ))}
          </nav>
        </div>
        <ActionForm action={addFeedbackAction} submitLabel="Log it" buttonClassName="btn btn-sm" className="mt-4 grid gap-2 sm:grid-cols-[11rem_12rem_1fr]" resetOnSuccess>
          <select name="kind" className="input text-sm" aria-label="Type">
            <option value="response">Reader response</option>
            <option value="conversation">Interesting conversation</option>
            <option value="question">Question received</option>
            <option value="idea">Idea sparked by a reader</option>
            <option value="revisit">Topic worth revisiting</option>
          </select>
          <input name="fromName" placeholder="From (first name only)" className="input text-sm" aria-label="From" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="followUp" className="accent-[#7a5c34]" /> Follow up
          </label>
          <textarea name="content" rows={2} className="input text-sm sm:col-span-3" placeholder="What was said, and what it made you think" aria-label="Content" />
        </ActionForm>
        <ul className="mt-5 space-y-3">
          {feedback.map(({ f, title, issueId }) => (
            <li key={f.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>
                  <Badge>{f.kind}</Badge> {f.fromName && `· ${f.fromName} `}· {f.createdAt.toLocaleDateString("en-CA")}
                  {title && (
                    <>
                      {" · re: "}
                      <Link href={`/studio/issues/${issueId}`} className="hover:text-ink">
                        {title}
                      </Link>
                    </>
                  )}
                </span>
                <form action={toggleFeedbackFollowUpAction}>
                  <input type="hidden" name="fid" value={f.id} />
                  <button className={f.followUp ? "text-bronze" : "underline"}>{f.followUp ? "★ Following up" : "Mark to follow up"}</button>
                </form>
              </div>
              <p className="mt-2 whitespace-pre-wrap font-serif text-[1.05rem] leading-relaxed">{f.content}</p>
            </li>
          ))}
          {feedback.length === 0 && <p className="text-sm text-muted">Nothing logged yet. When someone replies to a letter, note what they said here.</p>}
        </ul>
      </section>
    </div>
  );
}
