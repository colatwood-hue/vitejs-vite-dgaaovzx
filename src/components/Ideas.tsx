import { useState } from 'react'
import { STAGES, uid, type Data, type Idea, type Stage } from '../lib/store'

interface Props {
  data: Data
  setData: React.Dispatch<React.SetStateAction<Data>>
  onWrite: (idea: Idea) => void
}

export default function Ideas({ data, setData, onWrite }: Props) {
  const { pillars } = data.settings
  const [text, setText] = useState('')
  const [pillar, setPillar] = useState(pillars[0] ?? '')
  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState<string | null>(null)

  const update = (id: string, patch: Partial<Idea>) =>
    setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const idea: Idea = { id: uid(), text: text.trim(), notes: '', pillar, stage: 'seed', createdAt: new Date().toISOString() }
    setData((d) => ({ ...d, ideas: [idea, ...d.ideas] }))
    setText('')
  }

  const remove = (id: string) => {
    if (confirm('Delete this idea?')) setData((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) }))
  }

  const visible = data.ideas.filter((i) => filter === 'All' || i.pillar === filter)
  const sprouting = data.ideas.filter((i) => i.stage === 'sprouting' || i.stage === 'ready').length

  return (
    <div className="page">
      <header className="page-head">
        <h1>Idea Inbox</h1>
        <p className="muted">Capture everything and judge nothing. Pick the idea with the most energy when it's time to write.</p>
      </header>

      <form className="capture card" onSubmit={add}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A thought, a question, a quote, a moment…"
          aria-label="New idea"
        />
        <select value={pillar} onChange={(e) => setPillar(e.target.value)} aria-label="Pillar">
          {pillars.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button className="btn primary">Capture</button>
      </form>

      {sprouting < 3 && (
        <p className="hint">
          💡 Keep at least 3 ideas in <b>Sprouting</b> or <b>Ready</b> and you'll never face a blank page. You have {sprouting} right now.
        </p>
      )}

      <div className="chips">
        {['All', ...pillars].map((p) => (
          <button key={p} className={`chip ${filter === p ? 'on' : ''}`} onClick={() => setFilter(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="board">
        {STAGES.map((s) => {
          const items = visible.filter((i) => i.stage === s.key)
          return (
            <section key={s.key} className="column">
              <h2>
                {s.emoji} {s.label} <span className="count">{items.length}</span>
              </h2>
              {items.length === 0 && <p className="empty">Nothing here yet</p>}
              {items.map((i) => (
                <article key={i.id} className="idea card">
                  <button className="idea-text" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    {i.text}
                  </button>
                  <div className="idea-meta">
                    <span className="tag">{i.pillar}</span>
                    {i.notes && <span className="muted small">📝 notes</span>}
                  </div>
                  {open === i.id && (
                    <div className="idea-detail">
                      <textarea
                        rows={4}
                        value={i.notes}
                        onChange={(e) => update(i.id, { notes: e.target.value })}
                        placeholder="Develop it: an example, a story, the 'so what', what you're unsure about…"
                      />
                      <div className="row wrap">
                        <select value={i.stage} onChange={(e) => update(i.id, { stage: e.target.value as Stage })}>
                          {STAGES.map((st) => (
                            <option key={st.key} value={st.key}>
                              {st.emoji} {st.label}
                            </option>
                          ))}
                        </select>
                        <select value={i.pillar} onChange={(e) => update(i.id, { pillar: e.target.value })}>
                          {pillars.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <button className="btn primary sm" onClick={() => onWrite(i)}>
                          ✍️ Write issue
                        </button>
                        <button className="btn ghost sm" onClick={() => remove(i.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
