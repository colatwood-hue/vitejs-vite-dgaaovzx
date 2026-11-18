import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { issues, pillars } from "@/db/schema";
import { createIssueAction } from "@/actions/issues";
import { issueLabel } from "@/lib/email/templates";
import { isApprovalCurrent } from "@/lib/issues";
import { Badge, Empty, PageHeader, issueStatusTone, relTime } from "@/components/studio/ui";

export const metadata = { title: "Issues" };

export default async function Issues() {
  const rows = await db
    .select({ issue: issues, pillar: pillars.name, words: sql<number>`array_length(regexp_split_to_array(trim(${issues.bodyMd}), '\\s+'), 1)` })
    .from(issues)
    .leftJoin(pillars, eq(pillars.id, issues.primaryPillarId))
    .orderBy(sql`${issues.number} desc nulls first`, desc(issues.updatedAt));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Publishing" title="Issues" description="Every letter, from first draft to the public archive.">
        <form action={createIssueAction} className="flex gap-2">
          <input name="title" placeholder="New issue title" className="input w-56" aria-label="New issue title" />
          <button className="btn">New issue</button>
        </form>
      </PageHeader>
      {rows.length === 0 ? (
        <Empty href="/studio/ideas" cta="Go to ideas">
          No issues yet. Start one here, or from an idea.
        </Empty>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map(({ issue: i, pillar, words }) => (
            <li key={i.id}>
              <Link href={`/studio/issues/${i.id}`} className="grid gap-1 px-1 py-4 hover:bg-card sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-4">
                <span className="eyebrow">{issueLabel(i.number)}</span>
                <span>
                  <span className="font-serif text-lg">{i.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {words || 0} words · updated {relTime(i.updatedAt)}
                    {pillar ? ` · ${pillar}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={issueStatusTone(i.status)}>{i.status}</Badge>
                  {i.approvedAt && !isApprovalCurrent(i) && <Badge tone="warn">edited since approval</Badge>}
                  {i.publishedAt && <Badge tone="ok">on the web</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
