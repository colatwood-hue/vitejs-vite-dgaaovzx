'use client'

import { useState, useTransition } from 'react'
import { createIssue, deleteEntry, setEntryStage } from './actions'

type Stage = 'seed' | 'sprouting' | 'ready' | 'used'
interface Entry { id: string; kind: string; body: string; pillar: string; stage: Stage; created_at: string }

const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'seed', label: 'Seed', hint: 'Raw. Most stay here.' },
  { key: 'sprouting', label: 'Sprouting', hint: 'Has an example and a “so what”.' },
  { key: 'ready', label: 'Ready', hint: 'You could write 500 words today.' },
  { key: 'used', label: 'In a letter', hint: 'Already a source.' },
]

export function EntryBoard({ entries }: { entries: Entry[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [pending, start] = useTransition()
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="eyebrow">Step 2 · Develop</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted">{selected.length ? `${selected.length} selected as sources` : 'Select entries to build a letter from'}</span>
          <button
            className="btn btn-accent btn-sm"
            disabled={pending}
            onClick={() => start(() => createIssue(selected))}
          >
            Start a letter{selected.length ? ` from ${selected.length}` : ''} →
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s) => {
          const items = entries.filter((e) => e.stage === s.key)
          return (
            <div key={s.key} className="rounded-xl bg-wash/70 p-3" data-stage={s.key}>
              <div className="flex items-baseline justify-between px-1">
                <h3 className="font-serif text-lg">{s.label}</h3>
                <span className="text-xs text-muted">{items.length}</span>
              </div>
              <p className="px-1 text-xs text-muted">{s.hint}</p>
              <ul className="mt-3 space-y-2">
                {items.map((e) => (
                  <li key={e.id} className={`rounded-lg border bg-sheet p-3 transition ${selected.includes(e.id) ? 'border-accent ring-2 ring-accent/20' : 'border-line'}`}>
                    <p className="whitespace-pre-line font-serif text-[15px] leading-snug">{e.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span className="font-semibold uppercase tracking-wider text-accent">{e.pillar}</span>
                      <span>· {e.kind.replace('_', ' ')}</span>
                      <span>· {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {s.key !== 'used' && (
                        <label className="btn btn-ghost btn-sm cursor-pointer">
                          <input type="checkbox" className="accent-[var(--color-accent)]" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
                          Use
                        </label>
                      )}
                      <select
                        aria-label="Stage"
                        value={e.stage}
                        onChange={(ev) => start(() => setEntryStage(e.id, ev.target.value as Stage))}
                        className="rounded border border-line bg-transparent px-1 py-0.5 text-xs"
                      >
                        {STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                      </select>
                      <button
                        className="btn btn-ghost btn-sm ml-auto !text-muted"
                        onClick={() => confirm('Delete this entry?') && start(() => deleteEntry(e.id))}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
