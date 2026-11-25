/**
 * Studio search built on Postgres full-text search (english stemming,
 * weighted fields, ranked, with highlighted snippets). Partial words fall back
 * to a substring match so typing "ambit" still finds "ambition".
 *
 * relatedIdeas() is the "related existing ideas" feature: it matches a piece of
 * writing against the idea library by shared (stemmed) vocabulary. It's
 * lexical, not semantic: good at shared words, blind to synonyms.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type SearchHit = {
  kind: "thought" | "idea" | "issue";
  id: string;
  title: string;
  snippet: string;
  rank: number;
  meta: string;
  createdAt: Date;
};

const HEADLINE = `StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "`;

/** Escape the snippet except for the <mark> tags ts_headline inserts. */
export function safeSnippet(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

export async function searchStudio(q: string, limit = 40): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 200);
  if (!query) return [];
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db.execute<{ kind: SearchHit["kind"]; id: string; title: string; snippet: string; rank: number; meta: string; created_at: Date }>(sql`
    with q as (select websearch_to_tsquery('english', ${query}) as tsq)
    select * from (
      select 'thought' as kind, t.id::text, coalesce(t.title, left(coalesce(nullif(t.original_content, ''), t.transcription, '(audio)'), 80)) as title,
        ts_headline('english', coalesce(t.original_content, '') || ' ' || coalesce(t.transcription, ''), q.tsq, ${HEADLINE}) as snippet,
        ts_rank(t.search, q.tsq) + case when t.search @@ q.tsq then 0 else 0.0001 end as rank,
        t.source_type::text || ' · ' || t.status::text as meta, t.created_at
      from thoughts t, q
      where t.search @@ q.tsq or t.original_content ilike ${like} or t.transcription ilike ${like} or t.title ilike ${like}
      union all
      select 'idea', i.id::text, i.working_title,
        ts_headline('english', i.thesis || ' ' || i.notes || ' ' || i.personal_experiences || ' ' || i.supporting_stories, q.tsq, ${HEADLINE}),
        ts_rank(i.search, q.tsq) * 1.2 + case when i.search @@ q.tsq then 0 else 0.0001 end,
        i.stage::text || case when i.archived_at is not null then ' · archived' else '' end, i.created_at
      from ideas i, q
      where i.search @@ q.tsq or i.working_title ilike ${like} or i.thesis ilike ${like} or i.notes ilike ${like}
      union all
      select 'issue', s.id::text, s.title,
        ts_headline('english', s.body_md, q.tsq, ${HEADLINE}),
        ts_rank(s.search, q.tsq) * 1.1 + case when s.search @@ q.tsq then 0 else 0.0001 end,
        s.status::text, s.created_at
      from issues s, q
      where s.search @@ q.tsq or s.title ilike ${like} or s.body_md ilike ${like}
    ) hits
    order by rank desc, created_at desc
    limit ${limit}
  `);
  return rows.map((r) => ({ kind: r.kind, id: r.id, title: r.title, snippet: safeSnippet(r.snippet ?? ""), rank: Number(r.rank), meta: r.meta, createdAt: new Date(r.created_at) }));
}

/**
 * Ideas that share vocabulary with `text`, best first. Uses an OR over the
 * text's stemmed lexemes (stop-words removed by the english parser), ranked.
 */
export async function relatedIdeas(text: string, opts: { excludeIds?: string[]; limit?: number } = {}) {
  const body = text.trim().slice(0, 20_000);
  if (!body) return [];
  const exclude = opts.excludeIds?.length ? opts.excludeIds : ["00000000-0000-0000-0000-000000000000"];
  const rows = await db.execute<{ id: string; title: string; stage: string; rank: number }>(sql`
    with lex as (
      select unnest(tsvector_to_array(to_tsvector('english', ${body}))) as w
    ), q as (
      select to_tsquery('simple', string_agg(quote_literal(w), ' | ')) as tsq from lex where length(w) > 2
    )
    select i.id::text, i.working_title as title, i.stage::text as stage, ts_rank_cd(i.search, q.tsq) as rank
    from ideas i, q
    where q.tsq is not null and i.archived_at is null and i.search @@ q.tsq
      and i.id::text not in (${sql.join(exclude.map((e) => sql`${e}`), sql`, `)})
    order by rank desc
    limit ${opts.limit ?? 5}
  `);
  return rows.map((r) => ({ id: r.id, title: r.title, stage: r.stage, rank: Number(r.rank) }));
}
