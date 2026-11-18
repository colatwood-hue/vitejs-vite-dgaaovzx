import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { issueRevisions, issues } from "@/db/schema";
import { diffLines } from "@/lib/diff";
import { restoreRevisionAction } from "@/actions/issues";
import { PageHeader } from "@/components/studio/ui";

export default async function RevisionCompare({ params }: { params: Promise<{ id: string; revId: string }> }) {
  const { id, revId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(revId)) notFound();
  const [[issue], [rev]] = await Promise.all([
    db.select().from(issues).where(eq(issues.id, id)),
    db.select().from(issueRevisions).where(and(eq(issueRevisions.id, revId), eq(issueRevisions.issueId, id))),
  ]);
  if (!issue || !rev) notFound();
  const compose = (x: { title: string; bodyMd: string; recommendationMd: string; closingMd: string; subject: string; previewText: string }) =>
    `# ${x.title}\n\n${x.bodyMd}\n\n[Worth your time]\n${x.recommendationMd}\n\n[Closing]\n${x.closingMd}\n\n[Subject] ${x.subject}\n[Preview] ${x.previewText}`;
  const diff = diffLines(compose(rev), compose(issue));
  const changes = diff.filter((d) => d.type !== "same").length;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-2 text-sm">
        <Link href={`/studio/issues/${id}`} className="text-muted hover:text-ink">
          ← Back to editor
        </Link>
      </p>
      <PageHeader eyebrow={`${rev.source.replace("_", " ")} · ${rev.createdAt.toLocaleString("en-CA")}`} title="Compare with current" description={`${changes} changed line(s). Red = only in this older version, green = only in the current text.`}>
        <form action={restoreRevisionAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="revisionId" value={rev.id} />
          <button className="btn">Restore this version</button>
        </form>
      </PageHeader>
      <pre className="card overflow-x-auto whitespace-pre-wrap p-4 font-serif text-[0.98rem] leading-relaxed">
        {diff.map((d, i) => (
          <div key={i} className={d.type === "add" ? "bg-ok/10 text-ok" : d.type === "del" ? "bg-danger/10 text-danger line-through decoration-danger/40" : "text-ink-soft"}>
            <span aria-hidden="true" className="mr-2 inline-block w-3 select-none text-muted">
              {d.type === "add" ? "+" : d.type === "del" ? "−" : " "}
            </span>
            <span className="sr-only">{d.type === "add" ? "Added: " : d.type === "del" ? "Removed: " : ""}</span>
            {d.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
