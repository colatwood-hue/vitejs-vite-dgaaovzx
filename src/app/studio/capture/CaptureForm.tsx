'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { createCaptureAction } from '../library/actions'

const KINDS = [
  ['thought', 'Thought'], ['quote', 'Quote'], ['book', 'Book'], ['film', 'Film'], ['social_post', 'Post'],
  ['conversation', 'Conversation'], ['experience', 'Experience'], ['journal', 'Journal'], ['other', 'Other'],
] as const
type Kind = (typeof KINDS)[number][0]
const OWN: Kind[] = ['thought', 'journal', 'experience']

const ORIGINAL_LABEL: Partial<Record<Kind, string>> = {
  quote: 'The quote, word for word', book: 'Passage or idea from the book', film: 'Line, scene or idea from the film',
  social_post: 'What the post said', conversation: 'What was said, and by whom', other: 'The original material',
}

function VoiceRecorder({ onRecorded, clip, onClear }: { onRecorded: (f: File) => void; clip: File | null; onClear: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'unsupported'>('idle')
  const [seconds, setSeconds] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const url = clip ? URL.createObjectURL(clip) : null
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setState('unsupported')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const mime = (r.mimeType || 'audio/webm').split(';')[0]
        const ext = mime.split('/')[1] === 'mp4' ? 'm4a' : mime.split('/')[1]
        onRecorded(new File(chunks, `voice-note-${new Date().toISOString().slice(0, 16).replace(':', '')}.${ext}`, { type: mime }))
      }
      r.start()
      rec.current = r
      setSeconds(0)
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      setState('recording')
    } catch {
      setState('unsupported')
    }
  }
  function stop() {
    rec.current?.stop()
    if (tick.current) clearInterval(tick.current)
    setState('idle')
  }

  if (clip && url)
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper/50 p-2">
        <audio controls src={url} className="h-9 max-w-full flex-1" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Remove</button>
      </div>
    )
  return (
    <div className="flex items-center gap-3">
      {state === 'recording' ? (
        <button type="button" onClick={stop} className="btn !border-danger !text-danger">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </button>
      ) : (
        <button type="button" onClick={start} className="btn">🎙 Record voice note</button>
      )}
      {state === 'unsupported' && <span className="text-xs text-muted">Recording isn&apos;t available here. Attach an audio file instead.</span>}
    </div>
  )
}

type State = Awaited<ReturnType<typeof createCaptureAction>>

/** Holds the action state; the form below is remounted (fresh fields) after every successful save. */
export function CaptureForm() {
  const [state, action, pending] = useActionState(createCaptureAction, undefined)
  return <CaptureFields key={state?.ok ? state.id : 'draft'} state={state} action={action} pending={pending} />
}

function CaptureFields({ state, action, pending }: { state: State; action: (fd: FormData) => void; pending: boolean }) {
  const [kind, setKind] = useState<Kind>('thought')
  const [voice, setVoice] = useState<File | null>(null)
  const own = OWN.includes(kind)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (voice) fd.append('files', voice)
    startTransition(() => action(fd))
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="eyebrow mb-2">What is it?</legend>
        <div className="-mx-1 flex flex-wrap gap-1.5">
          {KINDS.map(([v, l]) => (
            <label key={v} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${kind === v ? 'border-ink bg-ink text-sheet' : 'border-line bg-sheet hover:border-ink-2'}`}>
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      {own ? (
        <div>
          <label htmlFor="reaction" className="mb-1 block text-sm font-semibold">In your own words</label>
          <textarea id="reaction" name="reaction" rows={6} autoFocus className="field font-serif !text-lg leading-relaxed"
            placeholder={kind === 'experience' ? 'What happened? Where were you? What did you notice?' : 'What are you thinking?'} />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="content" className="mb-1 block text-sm font-semibold">{ORIGINAL_LABEL[kind]}</label>
            <p className="mb-1.5 text-xs text-muted">Kept exactly as you enter it, separate from your thoughts.</p>
            <textarea id="content" name="content" rows={4} className="field font-serif !text-lg italic leading-relaxed" />
          </div>
          <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
            <legend className="eyebrow px-1">Source</legend>
            <label className="block text-sm sm:col-span-2">Link<input name="source_url" type="url" inputMode="url" placeholder="https://" className="field mt-1" /></label>
            <label className="block text-sm">By (author, speaker, account)<input name="attribution" className="field mt-1" /></label>
            <label className="block text-sm">From (book, film, show, place)<input name="source_title" className="field mt-1" /></label>
            <label className="block text-sm">Where in it (page, timestamp)<input name="source_locator" className="field mt-1" /></label>
            <label className="block text-sm">When you encountered it<input name="occurred_at" type="date" className="field mt-1" /></label>
          </fieldset>
          <div>
            <label htmlFor="reaction" className="mb-1 block text-sm font-semibold">Your reaction</label>
            <textarea id="reaction" name="reaction" rows={3} className="field font-serif !text-lg" placeholder="Why did this stop you? Do you agree?" />
          </div>
        </>
      )}

      {own && (
        <label className="block text-sm">When it happened (optional)<input name="occurred_at" type="date" className="field mt-1" /></label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Title (optional)<input name="title" className="field mt-1" /></label>
        <label className="block text-sm">Tags, comma-separated<input name="tags" className="field mt-1" placeholder="patience, work" autoCapitalize="none" /></label>
      </div>

      <div className="space-y-2">
        <VoiceRecorder clip={voice} onRecorded={setVoice} onClear={() => setVoice(null)} />
        <label className="block text-sm">
          Attach files <span className="text-xs text-muted">(audio, images, PDF, text · 4 MB total)</span>
          <input name="files" type="file" multiple accept="audio/*,image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-sheet file:px-3 file:py-1.5" />
        </label>
      </div>

      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state?.ok && state.id && (
        <p role="status" className="rounded-md bg-wash px-3 py-2 text-sm">
          Saved. <Link href={`/studio/library/${state.id}`} className="text-accent underline">Open it</Link> or capture the next one.
        </p>
      )}
      <button className="btn btn-primary w-full !py-3 text-base sm:w-auto" disabled={pending}>{pending ? 'Saving…' : 'Save to library'}</button>
    </form>
  )
}
