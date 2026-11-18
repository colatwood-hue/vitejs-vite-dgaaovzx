import Link from 'next/link'
import { CAPTURE_KINDS, HL_END, HL_START, KIND_LABEL, listTags, searchLibrary, type CaptureKind } from '@/lib/knowledge'
import { requireStudio } from '@/lib/session'

export const metadata = { title: 'Library' }

/** Render search highlights by splitting on private marker characters: no HTML is ever injected. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(HL_START)
  return (
    <>
      {parts.map((p, i) => {
        if (i === 0) return <span key={i}>{p}</span>
        const [hit, rest] = p.split(HL_END)
        return <span key={i}><mark className="rounded bg-accent-soft px-0.5 text-ink">{hit}</mark>{rest}</span>
      })}
    </>
  )
}

export default async function LibraryPage(props: PageProps<'/studio/library'>) {
  await requireStudio()
  const sp = await props.searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const kind = typeof sp.kind === 'string' && (CAPTURE_KINDS as readonly string[]).includes(sp.kind) ? (sp.kind as CaptureKind) : undefined
  const tag = typeof sp.tag === 'string' ? sp.tag : undefined
  const [rows, tags] = await Promise.all([searchLibrary({ q, kind, tag }), listTags()])

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-4xl">Library</h1>
        <Link href="/studio/capture" className="btn btn-primary btn-sm">+ Capture</Link>
      </div>

      <form role="search" className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search your library</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search words, authors, reactions…" className="field min-w-0 flex-1" />
        <label htmlFor="kind" className="sr-only">Type</label>
        <select id="kind" name="kind" defaultValue={kind ?? ''} className="field !w-auto">
          <option value="">All types</option>
          {CAPTURE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button className="btn">Search</button>
      </form>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tag && <Link href={{ pathname: '/studio/library', query: { ...(q && { q }), ...(kind && { kind }) } }} className="rounded-full bg-ink px-2.5 py-0.5 text-xs text-sheet">#{tag} ✕</Link>}
          {tags.filter((t) => t.name !== tag).slice(0, 30).map((t) => (
            <Link key={t.name} href={{ pathname: '/studio/library', query: { ...(q && { q }), ...(kind && { kind }), tag: t.name } }}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 hover:border-ink-2">#{t.name} <span className="text-muted">{t.n}</span></Link>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted" data-testid="result-count">{rows.length} {rows.length === 1 ? 'item' : 'items'}{q && <> matching “{q}”</>}</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/studio/library/${r.id}`} className="block py-4 hover:bg-wash/40">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] uppercase tracking-wider text-muted">
                <span className="font-semibold text-accent">{KIND_LABEL[r.kind]}</span>
                {(r.attribution || r.source_title) && <span className="normal-case tracking-normal">{[r.attribution, r.source_title].filter(Boolean).join(' · ')}</span>}
                <span className="ml-auto normal-case tracking-normal">{r.created_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              {r.title && <p className="mt-1 font-serif text-xl leading-snug">{r.title}</p>}
              {r.snippet && <p className="mt-1 line-clamp-3 font-serif text-[15px] text-ink-2"><Snippet text={r.snippet} /></p>}
              {(r.tags.length > 0 || r.attachments > 0) && (
                <p className="mt-1.5 text-xs text-muted">{r.tags.map((t) => `#${t}`).join(' ')} {r.attachments > 0 && `· 📎 ${r.attachments}`}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="mt-8 font-serif text-lg italic text-muted">{q || tag || kind ? 'Nothing matches.' : 'Your library is empty. Capture something.'}</p>}
    </main>
  )
}
