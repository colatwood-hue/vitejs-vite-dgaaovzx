import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCapture, KIND_LABEL, OWN_WORDS_KINDS } from '@/lib/knowledge'
import { requireStudio } from '@/lib/session'
import { uuid } from '@/lib/validation'
import { CaptureActions } from './CaptureActions'
import { EditCapture } from './EditCapture'

export const metadata = { title: 'Library item' }

const fmt = (d: Date) => d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

function Origin({ origin }: { origin: 'human' | 'ai' | null }) {
  if (!origin) return null
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${origin === 'ai' ? 'bg-accent-soft text-accent' : 'bg-wash text-ink-2'}`}>{origin === 'ai' ? 'AI-written' : 'Written by you'}</span>
}

export default async function CapturePage(props: PageProps<'/studio/library/[id]'>) {
  await requireStudio()
  const { id } = await props.params
  if (!uuid.safeParse(id).success) notFound()
  const c = await getCapture(id)
  if (!c) notFound()
  const own = OWN_WORDS_KINDS.includes(c.kind)
  const provenance = [c.attribution, c.source_title, c.source_locator].filter(Boolean)

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <Link href="/studio/library" className="eyebrow hover:text-accent">← Library</Link>
      <article className="mt-6">
        <p className="eyebrow !text-accent" data-testid="capture-kind">{KIND_LABEL[c.kind]}</p>
        {c.title && <h1 className="mt-2 font-serif text-4xl leading-tight">{c.title}</h1>}

        {!own && (c.content || provenance.length > 0 || c.source_url) && (
          <section className="mt-6" aria-labelledby="original-h">
            <h2 id="original-h" className="eyebrow">Original source</h2>
            {c.content && <blockquote data-testid="original" className="mt-2 whitespace-pre-line border-l-2 border-accent pl-4 font-serif text-xl italic leading-relaxed text-ink-2">{c.content}</blockquote>}
            {(provenance.length > 0 || c.source_url) && (
              <p className="mt-2 text-sm text-muted" data-testid="provenance">
                {provenance.length > 0 && <>— {provenance.join(', ')}</>}
                {c.source_url && <> {provenance.length > 0 && '· '}<a href={c.source_url} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-accent underline">{c.source_url.replace(/^https?:\/\//, '').slice(0, 80)}</a></>}
              </p>
            )}
          </section>
        )}

        {c.reaction && (
          <section className="mt-8" aria-labelledby="reaction-h">
            <h2 id="reaction-h" className="eyebrow">{own ? 'Your words' : 'Your reaction'}</h2>
            <p data-testid="reaction" className="mt-2 whitespace-pre-line font-serif text-lg leading-relaxed">{c.reaction}</p>
          </section>
        )}

        {c.summary && (
          <section className="mt-8">
            <h2 className="eyebrow">Summary <Origin origin={c.summary_origin} /></h2>
            <p className="mt-2 whitespace-pre-line text-[15px] text-ink-2">{c.summary}</p>
          </section>
        )}
        {c.transcript && (
          <section className="mt-8">
            <h2 className="eyebrow">Transcript <Origin origin={c.transcript_origin} /></h2>
            <p className="mt-2 whitespace-pre-line text-[15px] text-ink-2">{c.transcript}</p>
          </section>
        )}

        {c.attachments.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow">Attachments</h2>
            <ul className="mt-2 space-y-3">
              {c.attachments.map((a) => {
                const src = `/studio/attachments/${a.id}`
                return (
                  <li key={a.id} className="rounded-lg border border-line bg-sheet p-3">
                    {a.mime_type.startsWith('audio/') && <audio controls preload="none" src={src} className="w-full" />}
                    {a.mime_type.startsWith('image/') && (
                      // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file
                      <img src={src} alt={a.filename} className="max-h-96 rounded" />
                    )}
                    <a href={src} className="mt-1 block text-sm text-accent underline" data-testid="attachment-link">{a.filename}</a>
                    <span className="text-xs text-muted">{a.mime_type} · {kb(a.size_bytes)}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <p className="mt-8 text-xs text-muted" data-testid="timestamps">
          Captured {fmt(c.created_at)}{c.occurred_at && <> · encountered {c.occurred_at.toLocaleDateString('en-US', { dateStyle: 'medium' })}</>}
          {c.updated_at.getTime() - c.created_at.getTime() > 1000 && <> · edited {fmt(c.updated_at)}</>}
        </p>
        {c.tags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {c.tags.map((t) => <Link key={t} href={{ pathname: '/studio/library', query: { tag: t } }} className="rounded-full border border-line px-2.5 py-0.5 text-xs">#{t}</Link>)}
          </p>
        )}
      </article>

      <CaptureActions id={c.id} promotedEntryId={c.promotedEntry?.id ?? null} />

      <EditCapture
        capture={{
          id: c.id, kind: c.kind, title: c.title, content: c.content, source_url: c.source_url ?? '', attribution: c.attribution,
          source_title: c.source_title, source_locator: c.source_locator, occurred_at: c.occurred_at ? c.occurred_at.toISOString().slice(0, 10) : '',
          reaction: c.reaction, summary: c.summary, transcript: c.transcript, tags: c.tags.join(', '),
        }}
      />
    </main>
  )
}
