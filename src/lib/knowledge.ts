import 'server-only'
import { sql } from './db'

export const CAPTURE_KINDS = ['thought', 'quote', 'book', 'film', 'social_post', 'conversation', 'experience', 'journal', 'other'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

/** Kinds where the main text is Col's own words (stored in `reaction`); the rest hold third-party material in `content`. */
export const OWN_WORDS_KINDS: readonly CaptureKind[] = ['thought', 'journal', 'experience']

export const KIND_LABEL: Record<CaptureKind, string> = {
  thought: 'Thought', quote: 'Quote', book: 'Book', film: 'Film', social_post: 'Social post',
  conversation: 'Conversation', experience: 'Experience', journal: 'Journal', other: 'Other',
}

export const ATTACHMENT_TYPES = [
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain',
] as const
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const MAX_ATTACHMENTS = 5

export interface Capture {
  id: string
  kind: CaptureKind
  title: string
  content: string
  source_url: string | null
  attribution: string
  source_title: string
  source_locator: string
  occurred_at: Date | null
  reaction: string
  transcript: string
  transcript_origin: 'human' | 'ai' | null
  summary: string
  summary_origin: 'human' | 'ai' | null
  created_at: Date
  updated_at: Date
}

export interface AttachmentMeta { id: string; filename: string; mime_type: string; size_bytes: number; created_at: Date }

export interface CaptureInput {
  kind: CaptureKind
  title: string
  content: string
  source_url: string | null
  attribution: string
  source_title: string
  source_locator: string
  occurred_at: Date | null
  reaction: string
  tags: string[]
}

export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').slice(0, 40).trim()

async function setTags(tx: typeof sql, captureId: string, tags: string[]) {
  await tx`delete from capture_tags where capture_id = ${captureId}`
  const names = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, 20)
  if (!names.length) return
  await tx`insert into tags ${tx(names.map((name) => ({ name })))} on conflict (name) do nothing`
  await tx`
    insert into capture_tags (capture_id, tag_id)
    select ${captureId}, id from tags where name in ${tx(names)}`
}

export async function createCapture(input: CaptureInput, files: { filename: string; mime_type: string; data: Buffer }[]) {
  return sql.begin(async (tx) => {
    const { tags, ...fields } = input
    const [row] = await tx<{ id: string }[]>`insert into captures ${tx(fields)} returning id`
    await setTags(tx as unknown as typeof sql, row.id, tags)
    for (const f of files) {
      await tx`insert into attachments (capture_id, filename, mime_type, size_bytes, data)
               values (${row.id}, ${f.filename}, ${f.mime_type}, ${f.data.length}, ${f.data})`
    }
    return row.id
  })
}

/** Editing never touches provenance timestamps (created_at) and records who wrote derived text. */
export async function updateCapture(
  id: string,
  input: CaptureInput & { summary: string; transcript: string },
  prev: Pick<Capture, 'summary' | 'summary_origin' | 'transcript' | 'transcript_origin'>,
) {
  const { tags, ...fields } = input
  // If Col edits AI-written text, it becomes Col's (human) text.
  const summary_origin = fields.summary === prev.summary ? prev.summary_origin : fields.summary ? 'human' : null
  const transcript_origin = fields.transcript === prev.transcript ? prev.transcript_origin : fields.transcript ? 'human' : null
  await sql.begin(async (tx) => {
    await tx`update captures set ${tx({ ...fields, summary_origin, transcript_origin })} where id = ${id}`
    await setTags(tx as unknown as typeof sql, id, tags)
  })
}

export async function getCapture(id: string) {
  const [c] = await sql<Capture[]>`select ${sql(CAPTURE_COLUMNS)} from captures where id = ${id}`
  if (!c) return null
  const [tags, attachments, promoted] = await Promise.all([
    sql<{ name: string }[]>`select t.name from capture_tags ct join tags t on t.id = ct.tag_id where ct.capture_id = ${id} order by t.name`,
    sql<AttachmentMeta[]>`select id, filename, mime_type, size_bytes, created_at from attachments where capture_id = ${id} order by created_at`,
    sql<{ id: string; stage: string }[]>`select id, stage from entries where capture_id = ${id}`,
  ])
  return { ...c, tags: tags.map((t) => t.name), attachments, promotedEntry: promoted[0] ?? null }
}

const CAPTURE_COLUMNS = [
  'id', 'kind', 'title', 'content', 'source_url', 'attribution', 'source_title', 'source_locator', 'occurred_at',
  'reaction', 'transcript', 'transcript_origin', 'summary', 'summary_origin', 'created_at', 'updated_at',
] as const

export interface LibraryRow {
  id: string
  kind: CaptureKind
  title: string
  attribution: string
  source_title: string
  snippet: string
  tags: string[]
  attachments: number
  created_at: Date
}

/** Highlight markers that can't appear in HTML; the UI splits on them instead of injecting markup. */
export const HL_START = '⁣⁤'
export const HL_END = '⁤⁣'

export async function searchLibrary({ q, kind, tag }: { q?: string; kind?: CaptureKind; tag?: string }) {
  const query = q?.trim() ? q.trim().slice(0, 200) : null
  const tagName = tag ? normalizeTag(tag) : null
  return sql<LibraryRow[]>`
    select c.id, c.kind, c.title, c.attribution, c.source_title, c.created_at,
      ${query
        ? sql`ts_headline('english', concat_ws(' · ', nullif(c.reaction, ''), nullif(c.content, ''), nullif(c.summary, ''), nullif(c.transcript, '')),
              websearch_to_tsquery('english', ${query}),
              ${`StartSel=${HL_START}, StopSel=${HL_END}, MaxWords=28, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "`})`
        : sql`left(coalesce(nullif(c.reaction, ''), nullif(c.content, ''), c.summary), 220)`} as snippet,
      coalesce((select array_agg(t.name order by t.name) from capture_tags ct join tags t on t.id = ct.tag_id where ct.capture_id = c.id), '{}') as tags,
      (select count(*)::int from attachments a where a.capture_id = c.id) as attachments
    from captures c
    where true
      ${query ? sql`and c.search @@ websearch_to_tsquery('english', ${query})` : sql``}
      ${kind ? sql`and c.kind = ${kind}` : sql``}
      ${tagName ? sql`and exists (select 1 from capture_tags ct join tags t on t.id = ct.tag_id where ct.capture_id = c.id and t.name = ${tagName})` : sql``}
    order by ${query ? sql`ts_rank(c.search, websearch_to_tsquery('english', ${query})) desc,` : sql``} c.created_at desc
    limit 200`
}

export const listTags = () =>
  sql<{ name: string; n: number }[]>`
    select t.name, count(*)::int as n from tags t join capture_tags ct on ct.tag_id = t.id group by t.name order by n desc, t.name limit 100`

export async function getAttachment(id: string) {
  const [a] = await sql<(AttachmentMeta & { data: Buffer })[]>`select id, filename, mime_type, size_bytes, data, created_at from attachments where id = ${id}`
  return a ?? null
}

export async function deleteCapture(id: string) {
  await sql`delete from captures where id = ${id}`
}

const ENTRY_KIND: Record<CaptureKind, string> = {
  thought: 'observation', quote: 'quote', book: 'reading', film: 'reading', social_post: 'reading',
  conversation: 'observation', experience: 'observation', journal: 'journal', other: 'observation',
}

/**
 * Promote to Newsletter: creates ONE editorial entry linked to the capture. Reads the capture,
 * never writes to it. Third-party material is quoted with attribution, never presented as Col's.
 */
export async function promoteCapture(id: string) {
  const c = await getCapture(id)
  if (!c) return null
  if (c.promotedEntry) return c.promotedEntry.id
  const own = OWN_WORDS_KINDS.includes(c.kind)
  const source = [c.attribution, c.source_title && `“${c.source_title}”`, c.source_locator].filter(Boolean).join(', ')
  const parts = own
    ? [c.title, c.reaction || c.content]
    : [c.reaction && `My reaction: ${c.reaction}`, c.content && `Source text: “${c.content}”${source ? ` (${source})` : ''}`, !c.content && source && `Source: ${source}`, c.source_url]
  const body = parts.filter(Boolean).join('\n\n').slice(0, 20000) || c.title || 'Untitled capture'
  const [row] = await sql<{ id: string }[]>`
    insert into entries (body, kind, pillar, capture_id) values (${body}, ${ENTRY_KIND[c.kind]}, 'Philosophy', ${id})
    on conflict (capture_id) where capture_id is not null do nothing returning id`
  if (row) return row.id
  const [existing] = await sql<{ id: string }[]>`select id from entries where capture_id = ${id}`
  return existing?.id ?? null
}

/** Everything Col owns, in one JSON document (open format). Attachments are base64-encoded. */
export async function exportAll() {
  const [captures, tags, attachments, entries, issues, issueSources, subscribers, sends] = await Promise.all([
    sql`select ${sql(CAPTURE_COLUMNS)} from captures order by created_at`,
    sql`select c.capture_id, t.name from capture_tags c join tags t on t.id = c.tag_id order by t.name`,
    sql<{ id: string; capture_id: string; filename: string; mime_type: string; size_bytes: number; data: Buffer; created_at: Date }[]>`select * from attachments order by created_at`,
    sql`select * from entries order by created_at`,
    sql`select * from issues order by number`,
    sql`select * from issue_sources`,
    sql`select id, email, name, status, consent_source, consent_at, unsubscribed_at, created_at from subscribers order by created_at`,
    sql`select * from sends order by created_at`,
  ])
  const tagsBy = new Map<string, string[]>()
  for (const t of tags as unknown as { capture_id: string; name: string }[]) tagsBy.set(t.capture_id, [...(tagsBy.get(t.capture_id) ?? []), t.name])
  return {
    format: 'the-dash-export/v1',
    exported_at: new Date().toISOString(),
    note: 'Subscriber records are personal data about other people. Store this file securely.',
    captures: captures.map((c) => ({ ...c, tags: tagsBy.get(c.id as string) ?? [] })),
    attachments: attachments.map(({ data, ...a }) => ({ ...a, data_base64: data.toString('base64') })),
    newsletter: { entries, issues, issue_sources: issueSources, subscribers, sends },
  }
}
