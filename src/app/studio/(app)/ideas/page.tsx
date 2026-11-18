import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ideas, pillars } from "@/db/schema";
import { allPillars } from "@/lib/pillars";
import { createIdeaAction, setStageAction } from "@/actions/ideas";
import { Badge, Empty, PageHeader, STAGES, stageLabel } from "@/components/studio/ui";

export const metadata = { title: "Ideas & Pipeline" };

type SP = { q?: string; pillar?: string; stage?: string; view?: string; archived?: string; from?: string; to?: string; sort?: string };

export default async function Ideas({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const where: SQL[] = [sp.archived === "1" ? isNotNull(ideas.archivedAt) : isNull(ideas.archivedAt)];
  if (sp.pillar) where.push(eq(pillars.slug, sp.pillar));
  if (sp.stage) where.push(eq(ideas.stage, sp.stage as "captured"));
  if (sp.from) where.push(gte(ideas.createdAt, new Date(sp.from)));
  if (sp.to) where.push(lte(ideas.createdAt, new Date(`${sp.to}T23:59:59`)));
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`;
    where.push(
      or(
        ilike(ideas.workingTitle, like),
        ilike(ideas.thesis, like),
        ilike(ideas.notes, like),
        ilike(ideas.supportingStories, like),
        ilike(ideas.personalExperiences, like),
        ilike(ideas.questions, like),
      )!,
    );
  }
  const order =
    sp.sort === "target"
      ? [sql`${ideas.targetDate} asc nulls last`, desc(ideas.updatedAt)]
      : sp.sort === "concept"
        ? [sql`${ideas.conceptNumber} asc nulls last`]
        : [desc(ideas.updatedAt)];
  const [rows, pillarList] = await Promise.all([
    db
      .select({
        id: ideas.id,
        conceptNumber: ideas.conceptNumber,
        title: ideas.workingTitle,
        thesis: ideas.thesis,
        stage: ideas.stage,
        targetDate: ideas.targetDate,
        updatedAt: ideas.updatedAt,
        pillar: pillars.name,
        thoughtCount: sql<number>`(select count(*)::int from idea_thoughts it where it.idea_id = ${ideas.id})`,
      })
      .from(ideas)
      .leftJoin(pillars, eq(pillars.id, ideas.primaryPillarId))
      .where(and(...where))
      .orderBy(...order, asc(ideas.workingTitle)),
    allPillars(),
  ]);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/studio/ideas?${p}`;
  };

  return (
    <div>
      <PageHeader eyebrow="Library" title="Ideas & Pipeline" description="Captured → Exploring → Ready to draft → Drafting → Editing → Scheduled → Published">
        <Link href={qs({ view: "board" })} className={`btn btn-sm ${view === "board" ? "" : "btn-ghost"}`}>
          Pipeline
        </Link>
        <Link href={qs({ view: "list" })} className={`btn btn-sm ${view === "list" ? "" : "btn-ghost"}`}>
          List
        </Link>
      </PageHeader>

      <form action={createIdeaAction} className="mb-6 flex flex-wrap gap-2">
        <label htmlFor="new-idea" className="sr-only">
          New idea working title
        </label>
        <input id="new-idea" name="workingTitle" required placeholder="New idea, working title…" className="input min-w-56 flex-1" />
        <select name="primaryPillarId" className="input w-auto" aria-label="Pillar">
          <option value="">No pillar</option>
          {pillarList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn">Add idea</button>
      </form>

      <form className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" role="search">
        <input type="hidden" name="view" value={view} />
        <div className="col-span-2 sm:min-w-48 sm:flex-1">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="pillar">
            Pillar
          </label>
          <select id="pillar" name="pillar" defaultValue={sp.pillar ?? ""} className="input">
            <option value="">All</option>
            {pillarList.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {view === "list" && (
          <div>
            <label className="field-label" htmlFor="stage">
              Stage
            </label>
            <select id="stage" name="stage" defaultValue={sp.stage ?? ""} className="input">
              <option value="">All</option>
              {STAGES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="from">
            Created from
          </label>
          <input id="from" type="date" name="from" defaultValue={sp.from} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">
            to
          </label>
          <input id="to" type="date" name="to" defaultValue={sp.to} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="sort">
            Sort
          </label>
          <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="input">
            <option value="">Recently updated</option>
            <option value="target">Target date</option>
            <option value="concept">Concept number</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} className="accent-[#7a5c34]" /> Archived
        </label>
        <button className="btn btn-ghost">Apply</button>
      </form>

      {rows.length === 0 ? (
        <Empty>No ideas match.</Empty>
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4">
          <div className="grid min-w-[72rem] grid-cols-7 gap-3">
            {STAGES.map(([stage, label]) => {
              const col = rows.filter((r) => r.stage === stage);
              return (
                <section key={stage} aria-label={label} className="rounded-sm bg-paper-deep/60 p-2">
                  <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-semibold text-ink-soft">
                    {label} <span className="font-normal text-muted">{col.length}</span>
                  </h2>
                  <ul className="space-y-2">
                    {col.map((r) => (
                      <li key={r.id} className="card p-3">
                        <Link href={`/studio/ideas/${r.id}`} className="block">
                          {r.conceptNumber && <span className="text-[0.7rem] text-muted">{r.conceptNumber} · </span>}
                          <span className="font-serif text-[0.98rem] leading-snug hover:text-bronze">{r.title}</span>
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-1 text-[0.7rem] text-muted">
                          {r.pillar && <span>{r.pillar}</span>}
                          {r.thoughtCount > 0 && <span>· {r.thoughtCount} notes</span>}
                          {r.targetDate && <span>· {r.targetDate}</span>}
                        </div>
                        <form action={setStageAction} className="mt-2">
                          <input type="hidden" name="id" value={r.id} />
                          <label className="sr-only" htmlFor={`stage-${r.id}`}>
                            Move to stage
                          </label>
                          <select id={`stage-${r.id}`} name="stage" defaultValue={r.stage} className="w-full rounded-sm border border-rule bg-paper px-1 py-0.5 text-[0.7rem]">
                            {STAGES.map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <button className="mt-1 text-[0.7rem] text-bronze underline">Move</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/studio/ideas/${r.id}`} className="grid gap-1 px-1 py-4 hover:bg-card sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-serif text-lg">
                    {r.conceptNumber && <span className="mr-2 text-sm text-muted">{r.conceptNumber}</span>}
                    {r.title}
                  </p>
                  {r.thesis && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{r.thesis}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={r.stage === "published" ? "ok" : r.stage === "captured" ? "neutral" : "accent"}>{stageLabel(r.stage)}</Badge>
                  {r.pillar && <span>{r.pillar}</span>}
                  {r.targetDate && <span>Target {r.targetDate}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
