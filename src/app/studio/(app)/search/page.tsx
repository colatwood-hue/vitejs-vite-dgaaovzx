import Link from "next/link";
import { searchStudio } from "@/lib/search";
import { Badge, Empty, PageHeader, relTime } from "@/components/studio/ui";

export const metadata = { title: "Search" };

const KIND = { thought: { label: "Thought", href: "/studio/inbox/" }, idea: { label: "Idea", href: "/studio/ideas/" }, issue: { label: "Issue", href: "/studio/issues/" } } as const;

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const hits = q.trim() ? await searchStudio(q) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Everything you've written" title="Search" description='Searches notes, transcripts, ideas and issues. Use "quotes" for phrases and -word to exclude.' />
      <form role="search" className="flex gap-2">
        <label htmlFor="sq" className="sr-only">
          Search
        </label>
        <input id="sq" name="q" defaultValue={q} autoFocus className="input font-serif text-lg" placeholder="courage, grandfather, “stay in the harbour”…" />
        <button className="btn">Search</button>
      </form>
      <div className="mt-6">
        {!q.trim() ? null : hits.length === 0 ? (
          <Empty>Nothing found for “{q}”.</Empty>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule" aria-label={`${hits.length} results`}>
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link href={`${KIND[h.kind].href}${h.id}`} className="block px-1 py-4 hover:bg-card">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={h.kind === "idea" ? "accent" : h.kind === "issue" ? "ok" : "neutral"}>{KIND[h.kind].label}</Badge>
                    <span>{h.meta.replaceAll("_", " ")}</span>
                    <span>{relTime(h.createdAt)}</span>
                  </div>
                  <p className="mt-1 font-serif text-lg">{h.title}</p>
                  {h.snippet && (
                    <p
                      className="mt-1 text-sm leading-relaxed text-ink-soft [&_mark]:bg-[#f1e2c4] [&_mark]:px-0.5 [&_mark]:text-ink"
                      dangerouslySetInnerHTML={{ __html: h.snippet }}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
