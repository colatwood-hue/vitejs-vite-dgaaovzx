'use client'

import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { editorExtensions } from '@/lib/content'
import type { IssueInput } from '@/lib/validation'
import { approveIssue, deleteIssue, publishIssue, saveIssue, unapproveIssue } from '../../actions'
import { StatusBadge } from '../StatusBadge'

type Status = 'draft' | 'approved' | 'published'
interface Props {
  siteUrl: string
  issue: IssueInput & { id: string; number: number; slug: string; status: Status; updatedAt: string; body: JSONContent }
  sources: { id: string; body: string; kind: string; pillar: string }[]
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

function Field({ label, hint, meta, children }: { label: string; hint?: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      {hint && <p className="mb-1.5 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  )
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
  if (!editor) return null
  const b = (label: string, active: boolean, run: () => void, title: string) => (
    <button type="button" title={title} aria-pressed={active} onClick={run}
      className={`rounded px-2 py-1 text-sm ${active ? 'bg-ink text-sheet' : 'hover:bg-wash'}`}>{label}</button>
  )
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('Link URL (https://…)', prev ?? 'https://')
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else if (/^https?:\/\//i.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    else alert('Links must start with http:// or https://')
  }
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-line px-2 py-1.5">
      {b('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
      {b('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
      {b('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading')}
      {b('H3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'Subheading')}
      {b('“ ”', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Quote')}
      {b('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bullet list')}
      {b('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
      {b('Link', editor.isActive('link'), setLink, 'Link')}
      {b('—', false, () => editor.chain().focus().setHorizontalRule().run(), 'Divider')}
    </div>
  )
}

export function IssueEditor({ issue, sources, siteUrl }: Props) {
  const locked = issue.status === 'published'
  const [draft, setDraft] = useState<IssueInput>({
    subject: issue.subject, preview: issue.preview, title: issue.title, opening: issue.opening,
    body: issue.body, learning: issue.learning, links: issue.links.length ? issue.links : [{ title: '', url: '', why: '' }], question: issue.question,
  })
  const [status, setStatus] = useState<Status>(issue.status)
  const [save, setSave] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(issue.updatedAt)
  const [view, setView] = useState<'desktop' | 'phone'>('desktop')
  const [pending, start] = useTransition()
  const latest = useRef(draft)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [...editorExtensions, Placeholder.configure({ placeholder: 'The moment → the tension → the insight → the practice → the open edge…' })],
    content: issue.body,
    editable: !locked,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'prose-dash px-5 py-4', 'aria-label': 'The big idea' } },
    onUpdate: ({ editor }) => update({ body: editor.getJSON() }),
  })

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setSave('saving')
    const res = await saveIssue(issue.id, latest.current)
    if (res?.error) { setSave('error'); setError(res.error); return false }
    setSave('saved'); setError(''); setStatus((s) => (s === 'approved' ? 'draft' : s)); setVersion(new Date().toISOString())
    return true
  }, [issue.id])

  function update(patch: Partial<IssueInput>) {
    if (locked) return
    latest.current = { ...latest.current, ...patch }
    setDraft(latest.current)
    setSave('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 1200)
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timer.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const bodyText = editor?.getText() ?? ''
  const total = words([draft.opening, bodyText, draft.learning, draft.question].join(' '))
  const setLink = (i: number, k: 'title' | 'url' | 'why', v: string) => update({ links: draft.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })
  const previewUrl = `/studio/issues/${issue.id}/preview?v=${encodeURIComponent(version)}`

  const run = (fn: () => Promise<{ error?: string } | undefined | void>, next?: Status) =>
    start(async () => {
      if (save !== 'saved' && !(await flush())) return
      const res = await fn()
      if (res && res.error) { setError(res.error); return }
      setError('')
      if (next) setStatus(next)
    })

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-24 pt-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/studio/issues" className="eyebrow hover:text-accent">← Letters</Link>
          <h1 className="font-serif text-3xl">No. {issue.number}</h1>
          <StatusBadge status={status} />
          <span className="ml-auto text-xs text-muted" aria-live="polite" data-testid="save-state">
            {locked ? 'Published · read only' : { saved: 'All changes saved', dirty: 'Unsaved…', saving: 'Saving…', error: 'Save failed' }[save]}
          </span>
        </div>

        {sources.length > 0 && (
          <details open className="rounded-xl border border-line bg-sheet p-4">
            <summary className="cursor-pointer text-sm font-semibold">Built from {sources.length} {sources.length === 1 ? 'entry' : 'entries'}. Stay true to these.</summary>
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="border-l-2 border-accent pl-3 font-serif text-[15px] text-ink-2">
                  {s.body} <span className="font-sans text-[11px] uppercase tracking-wider text-muted">· {s.pillar} · {s.kind.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <fieldset disabled={locked} className="space-y-5 rounded-xl border border-line bg-sheet p-5">
          <legend className="eyebrow px-1">The inbox</legend>
          <Field label="Subject line" hint="Specific, curious, honest. Under 50 characters." meta={<span className={draft.subject.length > 50 ? 'text-danger' : ''}>{draft.subject.length}/50</span>}>
            <input className="field" value={draft.subject} onChange={(e) => update({ subject: e.target.value })} aria-label="Subject line" />
          </Field>
          <Field label="Preview text" hint="Shown beside the subject in the inbox. Never leave it blank.">
            <input className="field" value={draft.preview} onChange={(e) => update({ preview: e.target.value })} aria-label="Preview text" />
          </Field>
        </fieldset>

        <fieldset disabled={locked} className="space-y-5 rounded-xl border border-line bg-sheet p-5">
          <legend className="eyebrow px-1">The letter</legend>
          <Field label="Headline">
            <input className="field font-serif !text-2xl" value={draft.title} onChange={(e) => update({ title: e.target.value })} aria-label="Headline" />
          </Field>
          <Field label="Opening note" hint="2–4 sentences. What's happening in your life right now?">
            <textarea className="field font-serif !text-lg" rows={3} value={draft.opening} onChange={(e) => update({ opening: e.target.value })} aria-label="Opening note" />
          </Field>
          <Field label="The big idea" hint="One idea, 300–700 words, in your own voice." meta={`${words(bodyText)} words`}>
            <div className="overflow-hidden rounded-md border border-line bg-paper/40 focus-within:border-accent">
              <Toolbar editor={editor} />
              <EditorContent editor={editor} />
            </div>
          </Field>
          <Field label="What I'm learning" hint="One per line: the thing, and what it taught you.">
            <textarea className="field" rows={3} value={draft.learning} onChange={(e) => update({ learning: e.target.value })} aria-label="What I'm learning" />
          </Field>
          <Field label="Worth your time" hint="Up to 3. Each needs a reason.">
            <div className="space-y-2">
              {draft.links.map((l, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                  <input className="field" placeholder="Title" value={l.title} onChange={(e) => setLink(i, 'title', e.target.value)} aria-label={`Link ${i + 1} title`} />
                  <input className="field" placeholder="https://…" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} aria-label={`Link ${i + 1} URL`} />
                  <input className="field" placeholder="Why it's worth it" value={l.why} onChange={(e) => setLink(i, 'why', e.target.value)} aria-label={`Link ${i + 1} reason`} />
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove link" onClick={() => update({ links: draft.links.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              {draft.links.length < 3 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ links: [...draft.links, { title: '', url: '', why: '' }] })}>+ Add link</button>
              )}
            </div>
          </Field>
          <Field label="A question for you" hint="One real question tied to the big idea. This earns replies.">
            <textarea className="field font-serif !text-lg" rows={2} value={draft.question} onChange={(e) => update({ question: e.target.value })} aria-label="A question for you" />
          </Field>
        </fieldset>

        <section className="rounded-xl border border-line bg-sheet p-5">
          <h2 className="eyebrow">Approve · Publish</h2>
          <p className="mt-2 text-sm text-ink-2">
            {status === 'draft' && 'Nothing goes out without your approval. Approving locks in this exact version, and any later edit returns it to draft.'}
            {status === 'approved' && 'Approved. Publishing puts it in the public archive. Email sending comes in milestone 2.'}
            {status === 'published' && <>Published at <a className="text-accent underline" href={`/issues/${issue.slug}`} target="_blank">{siteUrl.replace(/^https?:\/\//, '')}/issues/{issue.slug}</a>.</>}
          </p>
          <p className="mt-1 text-xs text-muted">~{total} words · {Math.max(1, Math.round(total / 230))} min read</p>
          {error && <p role="alert" className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {status === 'draft' && <button className="btn btn-primary" disabled={pending} onClick={() => run(() => approveIssue(issue.id), 'approved')}>Approve this version</button>}
            {status === 'approved' && (
              <>
                <button className="btn btn-accent" disabled={pending} onClick={() => confirm('Publish to the public archive?') && run(() => publishIssue(issue.id), 'published')}>Publish</button>
                <button className="btn" disabled={pending} onClick={() => run(() => unapproveIssue(issue.id), 'draft')}>Back to draft</button>
              </>
            )}
            {status !== 'published' && (
              <button className="btn btn-ghost ml-auto !text-danger" disabled={pending} onClick={() => confirm('Delete this draft?') && start(() => deleteIssue(issue.id))}>Delete draft</button>
            )}
          </div>
        </section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-line text-sm">
            {(['desktop', 'phone'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 capitalize ${view === v ? 'bg-ink text-sheet' : 'bg-sheet'}`}>{v}</button>
            ))}
          </div>
          <a className="btn btn-sm ml-auto" href={`${previewUrl}&download`}>Download HTML</a>
          <a className="btn btn-sm" href={`${previewUrl}&format=text`} target="_blank">Plain text</a>
        </div>
        <div className="mt-3 rounded-lg border border-line bg-sheet px-3 py-2 text-[13px]">
          <span className="font-semibold">Col</span>{' '}
          <span className="font-semibold">{draft.subject || 'No subject yet'}</span>{' '}
          <span className="text-muted">— {draft.preview || 'No preview text'}</span>
        </div>
        <div className={`mt-3 overflow-hidden bg-[#f4efe6] ${view === 'phone' ? 'mx-auto w-[390px] max-w-full rounded-[2rem] border-[10px] border-ink' : 'rounded-xl border border-line'}`}>
          <iframe key={version} title="Email preview" src={previewUrl} className="block h-[calc(100vh-12rem)] min-h-[560px] w-full" />
        </div>
        <p className="mt-2 text-xs text-muted">Preview refreshes after each save.</p>
      </aside>
    </div>
  )
}
