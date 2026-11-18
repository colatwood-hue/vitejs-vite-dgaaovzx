import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { nowMs } from "@/lib/time";
import { campaigns, ideas, issues, readerFeedback, subscribers, thoughts } from "@/db/schema";
import { onboardingSteps } from "@/lib/integrations";
import { CaptureForm } from "@/components/studio/CaptureForm";
import { Badge, PageHeader, STAGES, Stat, SOURCE_LABELS, relTime, stageLabel } from "@/components/studio/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const [steps, [subs], newThoughts, stageCounts, inProgress, scheduled, [lastPub], followUps] = await Promise.all([
    onboardingSteps(),
    db.select({ n: sql<number>`count(*)::int` }).from(subscribers).where(eq(subscribers.status, "active")),
    db.select().from(thoughts).where(eq(thoughts.status, "new")).orderBy(desc(thoughts.createdAt)).limit(5),
    db.select({ stage: ideas.stage, n: sql<number>`count(*)::int` }).from(ideas).where(isNull(ideas.archivedAt)).groupBy(ideas.stage),
    db.select().from(issues).where(inArray(issues.status, ["draft", "approved"])).orderBy(desc(issues.updatedAt)).limit(4),
    db.select({ c: campaigns, title: issues.title }).from(campaigns).innerJoin(issues, eq(issues.id, campaigns.issueId)).where(and(eq(campaigns.kind, "broadcast"), inArray(campaigns.status, ["scheduled", "sending"]))).orderBy(asc(campaigns.scheduledFor)),
    db.select({ publishedAt: issues.publishedAt }).from(issues).where(sql`${issues.publishedAt} is not null`).orderBy(desc(issues.publishedAt)).limit(1),
    db.select().from(readerFeedback).where(eq(readerFeedback.followUp, true)).orderBy(desc(readerFeedback.createdAt)).limit(3),
  ]);
  const [concept001] = await db.select({ id: ideas.id, title: ideas.workingTitle, stage: ideas.stage }).from(ideas).where(eq(ideas.conceptNumber, "001"));
  const remaining = steps.filter((s) => !s.done);
  const counts = Object.fromEntries(stageCounts.map((s) => [s.stage, s.n]));
  const daysSince = lastPub?.publishedAt ? Math.floor((nowMs() - lastPub.publishedAt.getTime()) / 86400_000) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow={new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })} title={welcome ? "Welcome to your studio" : "Good to see you"} />

      {remaining.length > 0 && (
        <section className="card mb-6 p-5" aria-labelledby="onboarding">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="onboarding" className="font-serif text-xl">
              Getting set up
            </h2>
            <span className="text-xs text-muted">
              {steps.length - remaining.length} of {steps.length} done
            </span>
          </div>
          <ol className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] ${s.done ? "border-ok bg-ok text-white" : s.status === "failed" ? "border-danger text-danger" : "border-rule text-muted"}`}>
                  {s.done ? "✓" : s.status === "failed" ? "!" : i + 1}
                </span>
                <span>
                  <Link href={s.href} className={s.done ? "text-muted line-through decoration-rule" : "hover:text-bronze"}>
                    {s.label}
                  </Link>
                  {!s.done && s.status && s.status !== "configured" && (
                    <>
                      {" "}
                      <Badge tone={s.status === "failed" ? "danger" : s.status === "optional" ? "neutral" : "warn"}>{s.status}</Badge>
                    </>
                  )}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <CaptureForm />

          <section aria-labelledby="writing">
            <h2 id="writing" className="eyebrow mb-3">
              Currently writing
            </h2>
            {inProgress.length === 0 ? (
              concept001 && ["captured", "exploring"].includes(concept001.stage) ? (
                <Link href={`/studio/ideas/${concept001.id}`} className="card block p-4 hover:bg-paper">
                  <span className="eyebrow text-bronze">Start here · Concept 001</span>
                  <span className="mt-1 block font-serif text-xl">{concept001.title}</span>
                  <span className="mt-1 block text-sm text-muted">An unfinished concept, ready for an interview with your editorial partner.</span>
                </Link>
              ) : (
              <p className="text-sm text-muted">
                Nothing in progress. Pick an idea from the{" "}
                <Link href="/studio/ideas" className="link">
                  pipeline
                </Link>
                .
              </p>
              )
            ) : (
              <ul className="card divide-y divide-rule">
                {inProgress.map((i) => (
                  <li key={i.id}>
                    <Link href={`/studio/issues/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                      <span className="font-serif text-lg">{i.title}</span>
                      <span className="shrink-0 text-xs text-muted">
                        <Badge tone={i.status === "approved" ? "accent" : "neutral"}>{i.status}</Badge> {relTime(i.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="new-thoughts">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="new-thoughts" className="eyebrow">
                Unreviewed thoughts
              </h2>
              <Link href="/studio/inbox?status=new" className="text-xs text-bronze">
                All →
              </Link>
            </div>
            {newThoughts.length === 0 ? (
              <p className="text-sm text-muted">Inbox zero.</p>
            ) : (
              <ul className="space-y-2">
                {newThoughts.map((t) => (
                  <li key={t.id}>
                    <Link href={`/studio/inbox/${t.id}`} className="card block px-4 py-3 hover:bg-paper">
                      <span className="text-xs text-muted">
                        {SOURCE_LABELS[t.sourceType]} · {relTime(t.createdAt)}
                      </span>
                      <span className="mt-1 line-clamp-2 block font-serif text-ink-soft">{t.title || t.originalContent || t.transcription || "(audio)"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Active subscribers" value={subs.n} />
            <Stat label="Days since last letter" value={daysSince ?? "—"} />
          </div>

          <section className="card p-4" aria-labelledby="pipeline">
            <div className="flex items-baseline justify-between">
              <h2 id="pipeline" className="eyebrow">
                Pipeline
              </h2>
              <Link href="/studio/ideas" className="text-xs text-bronze">
                Open →
              </Link>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {STAGES.map(([k, l]) => (
                <li key={k} className="flex justify-between">
                  <Link href={`/studio/ideas?view=list&stage=${k}`} className="hover:text-bronze">
                    {l}
                  </Link>
                  <span className="tabular-nums text-muted">{counts[k] ?? 0}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4" aria-labelledby="scheduled">
            <h2 id="scheduled" className="eyebrow">
              Scheduled & sending
            </h2>
            {scheduled.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing scheduled.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {scheduled.map(({ c, title }) => (
                  <li key={c.id}>
                    <Link href={`/studio/issues/${c.issueId}`} className="hover:text-bronze">
                      {title}
                    </Link>
                    <span className="block text-xs text-muted">
                      {stageLabel(c.status)} · {c.scheduledFor?.toLocaleString("en-CA")} · {c.recipientCount} recipients
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {followUps.length > 0 && (
            <section className="card p-4" aria-labelledby="follow">
              <h2 id="follow" className="eyebrow">
                Readers to follow up with
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {followUps.map((f) => (
                  <li key={f.id} className="line-clamp-2 font-serif text-ink-soft">
                    {f.fromName && <strong className="font-sans text-xs text-ink">{f.fromName}: </strong>}
                    {f.content}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
