'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createEntry } from './actions'

const KINDS = [
  ['observation', 'Observation'],
  ['journal', 'Journal'],
  ['voice_note', 'Voice note'],
  ['reading', 'Reading'],
  ['quote', 'Quote'],
  ['question', 'Question'],
] as const

export function CaptureForm({ pillars }: { pillars: string[] }) {
  const [state, action, pending] = useActionState(createEntry, undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state?.ok) form.current?.reset() }, [state])

  return (
    <form ref={form} action={action} className="mt-6 rounded-xl border border-line bg-sheet p-4 shadow-sm">
      <label htmlFor="entry-body" className="sr-only">New entry</label>
      <textarea
        id="entry-body"
        name="body"
        required
        rows={3}
        placeholder="The moment, the thought, the line you can't stop thinking about…"
        className="w-full resize-y bg-transparent font-serif text-xl leading-relaxed placeholder:italic placeholder:text-muted/70 focus:outline-none"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.current?.requestSubmit() }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <select name="kind" aria-label="Kind" className="field !w-auto !py-1.5 text-sm">
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="pillar" aria-label="Pillar" className="field !w-auto !py-1.5 text-sm">
          {pillars.map((p) => <option key={p}>{p}</option>)}
        </select>
        {state?.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        <span className="ml-auto hidden text-xs text-muted sm:inline">⌘/Ctrl + Enter</span>
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Capture'}</button>
      </div>
    </form>
  )
}
