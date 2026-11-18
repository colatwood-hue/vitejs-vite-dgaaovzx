import Link from "next/link";
import { excerpt } from "@/lib/markdown";
import { issueLabel } from "@/lib/email/templates";

export type IssueListItem = {
  slug: string;
  number: number | null;
  title: string;
  subtitle: string;
  previewText: string;
  bodyMd: string;
  publishedAt: Date | null;
  readingMinutes: number;
  pillarName: string | null;
};

export function formatDate(d: Date | null, style: "long" | "short" = "long") {
  if (!d) return "";
  return d.toLocaleDateString("en-CA", style === "long" ? { year: "numeric", month: "long", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
}

export function IssueList({ items }: { items: IssueListItem[] }) {
  return (
    <ol className="divide-y divide-rule">
      {items.map((i) => (
        <li key={i.slug}>
          <Link href={`/issues/${i.slug}`} className="group grid gap-1 py-7 sm:grid-cols-[7.5rem_1fr] sm:gap-6">
            <div className="eyebrow pt-1.5">
              {issueLabel(i.number)}
              <span className="mt-1 block normal-case tracking-normal">{formatDate(i.publishedAt, "short")}</span>
            </div>
            <div>
              <h3 className="font-serif text-2xl leading-snug text-ink group-hover:text-bronze sm:text-[1.65rem]">{i.title}</h3>
              <p className="mt-2 max-w-2xl font-serif text-lg leading-relaxed text-ink-soft">
                {i.subtitle || i.previewText || excerpt(i.bodyMd, 180)}
              </p>
              <p className="mt-3 text-xs text-muted">
                {i.readingMinutes} min read{i.pillarName ? ` · ${i.pillarName}` : ""}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
