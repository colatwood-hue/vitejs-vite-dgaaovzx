import { useState } from 'react'
import { defaultData, type Data, type Settings } from '../lib/store'

interface Props {
  data: Data
  setData: React.Dispatch<React.SetStateAction<Data>>
}

export default function Setup({ data, setData }: Props) {
  const s = data.settings
  const [newPillar, setNewPillar] = useState('')
  const set = (patch: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))

  const exportData = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `newsletter-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const importData = (file: File) => {
    file.text().then((t) => {
      try {
        const parsed = JSON.parse(t) as Data
        if (!parsed.settings || !Array.isArray(parsed.ideas) || !Array.isArray(parsed.issues)) throw new Error()
        if (confirm('Replace everything here with this backup?')) setData(parsed)
      } catch {
        alert("That file doesn't look like a newsletter backup.")
      }
    })
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Foundation</h1>
        <p className="muted">Decide these once and revisit them every 3 months.</p>
      </header>

      <section className="card stack">
        <label className="field">
          <span className="field-label">Why this exists</span>
          <span className="guide">One sentence. When you're stuck, come back to it.</span>
          <textarea rows={2} value={s.why} onChange={(e) => set({ why: e.target.value })} />
        </label>
        <div className="two">
          <label className="field">
            <span className="field-label">Newsletter name</span>
            <input value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Your name (sender)</span>
            <input value={s.author} onChange={(e) => set({ author: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Sign-off</span>
            <input value={s.signoff} onChange={(e) => set({ signoff: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Send every</span>
            <select value={s.cadenceDays} onChange={(e) => set({ cadenceDays: Number(e.target.value) })}>
              <option value={7}>Week</option>
              <option value={14}>Two weeks (recommended)</option>
              <option value={30}>Month</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Accent color</span>
            <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2>Content pillars</h2>
        <p className="guide">Use 3 to 4. Every idea gets one. Over time you'll see which ones readers respond to.</p>
        <div className="chips">
          {s.pillars.map((p) => (
            <span key={p} className="chip on">
              {p}
              <button aria-label={`Remove ${p}`} onClick={() => set({ pillars: s.pillars.filter((x) => x !== p) })}>✕</button>
            </span>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            const p = newPillar.trim()
            if (p && !s.pillars.includes(p)) set({ pillars: [...s.pillars, p] })
            setNewPillar('')
          }}
        >
          <input value={newPillar} onChange={(e) => setNewPillar(e.target.value)} placeholder="Add a pillar" />
          <button className="btn">Add</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Backup</h2>
        <p className="guide">Everything is saved in this browser only. Export a backup now and then, or to move to another device.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>⬇ Export backup</button>
          <label className="btn ghost">
            ⬆ Import backup
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
          <button className="btn ghost danger" onClick={() => confirm('Reset everything to the starter content? This cannot be undone.') && setData(defaultData())}>
            Reset
          </button>
        </div>
      </section>
    </div>
  )
}
