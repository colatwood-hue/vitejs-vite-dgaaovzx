import type { Metadata } from "next";
import Link from "next/link";
import { publishedIssues } from "@/lib/issues";
import { allPillars } from "@/lib/pillars";
import { IssueList } from "@/components/IssueList";

export const metadata: Metadata = { title: "Archive", alternates: { canonical: "/archive" } };

export default async function Archive({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  const [issues, pillars] = await Promise.all([publishedIssues({ pillarSlug: theme }), allPillars()]);
  const active = pillars.find((p) => p.slug === theme);

  const byYear = new Map<number, typeof issues>();
  for (const i of issues) {
    const y = i.publishedAt!.getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), i]);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-16 sm:px-6">
      <p className="eyebrow">The archive</p>
      <h1 className="mt-4 font-serif text-4xl sm:text-5xl">{active ? active.name : "Every letter"}</h1>
      {active && <p className="mt-3 max-w-xl font-serif text-lg text-ink-soft">{active.description}</p>}

      <nav aria-label="Filter by theme" className="mt-8 flex flex-wrap gap-2">
        <Link href="/archive" className={`chip ${!theme ? "border-ink text-ink" : ""}`} aria-current={!theme ? "page" : undefined}>
          All
        </Link>
        {pillars.map((p) => (
          <Link
            key={p.slug}
            href={`/archive?theme=${p.slug}`}
            className={`chip ${theme === p.slug ? "border-ink text-ink" : ""}`}
            aria-current={theme === p.slug ? "page" : undefined}
          >
            {p.name}
          </Link>
        ))}
      </nav>

      {issues.length === 0 ? (
        <p className="mt-16 font-serif text-xl text-ink-soft">
          {active ? "No letters in this theme yet." : "No letters published yet. The first one is on its way."}
        </p>
      ) : (
        [...byYear.entries()].map(([year, list]) => (
          <section key={year} className="mt-12">
            <h2 className="eyebrow border-b border-rule pb-3">{year}</h2>
            <IssueList items={list} />
          </section>
        ))
      )}
    </div>
  );
}
