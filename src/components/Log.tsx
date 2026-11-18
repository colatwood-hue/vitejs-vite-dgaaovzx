import type { Data, Issue } from '../lib/store'

interface Props {
  data: Data
  updateIssue: (id: string, patch: Partial<Issue>) => void
  onOpen: (id: string) => void
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–')
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function Log({ data, updateIssue, onOpen }: Props) {
  const sent = data.issues.filter((i) => i.status === 'sent').sort((a, b) => b.number - a.number)
  const last = sent[0]
  const next = last?.sentAt ? new Date(new Date(last.sentAt).getTime() + data.settings.cadenceDays * 864e5) : null
  const daysToNext = next ? Math.ceil((next.getTime() - Date.now()) / 864e5) : null
  const totalReplies = sent.reduce((s, i) => s + i.stats.replies, 0)
  const avgOpen = sent.filter((i) => i.stats.recipients).map((i) => i.stats.opens / i.stats.recipients)
  const lastRecipients = sent.find((i) => i.stats.recipients)?.stats.recipients ?? 0

  const setStat = (i: Issue, key: keyof Issue['stats'], v: string) =>
    updateIssue(i.id, { stats: { ...i.stats, [key]: Math.max(0, Number(v) || 0) } })

  return (
    <div className="page">
      <header className="page-head">
        <h1>Issue Log</h1>
        <p className="muted">Treat every issue as a small experiment. Log the numbers 2 to 3 days after sending, then write one lesson.</p>
      </header>

      <div className="kpis">
        <div className="kpi card"><span className="kpi-v">{sent.length}</span><span className="kpi-l">Issues sent</span></div>
        <div className="kpi card"><span className="kpi-v">{lastRecipients || '–'}</span><span className="kpi-l">Readers</span></div>
        <div className="kpi card"><span className="kpi-v">{avgOpen.length ? `${Math.round((avgOpen.reduce((a, b) => a + b, 0) / avgOpen.length) * 100)}%` : '–'}</span><span className="kpi-l">Avg open rate</span></div>
        <div className="kpi card"><span className="kpi-v">{totalReplies}</span><span className="kpi-l">Total replies ★</span></div>
        <div className="kpi card">
          <span className={`kpi-v ${daysToNext !== null && daysToNext < 0 ? 'warn' : ''}`}>
            {daysToNext === null ? '–' : daysToNext <= 0 ? (daysToNext === 0 ? 'Today' : `${-daysToNext}d late`) : `${daysToNext}d`}
          </span>
          <span className="kpi-l">Next issue due</span>
        </div>
      </div>

      {sent.length === 0 && <p className="empty card">No sent issues yet. Once you mark an issue as sent, it'll show up here.</p>}

      {sent.map((i) => (
        <article key={i.id} className="log card">
          <div className="row between wrap">
            <div>
              <button className="link" onClick={() => onOpen(i.id)}>
                No. {i.number}: {i.subject || 'Untitled'}
              </button>
              <div className="muted small">Sent {fmt(i.sentAt)}</div>
            </div>
            <div className="rates">
              <span>Open <b>{pct(i.stats.opens, i.stats.recipients)}</b></span>
              <span>Click <b>{pct(i.stats.clicks, i.stats.recipients)}</b></span>
              <span>Replies <b>{i.stats.replies}</b></span>
            </div>
          </div>
          <div className="stats-grid">
            {(
              [
                ['recipients', 'Sent to'],
                ['opens', 'Opens'],
                ['clicks', 'Clicks'],
                ['replies', 'Replies'],
                ['unsubs', 'Unsubs'],
                ['newSubs', 'New subs'],
              ] as const
            ).map(([k, l]) => (
              <label key={k}>
                <span>{l}</span>
                <input type="number" min={0} value={i.stats[k] || ''} onChange={(e) => setStat(i, k, e.target.value)} />
              </label>
            ))}
          </div>
          <label className="field">
            <span className="field-label">One lesson: “Next time I'll…”</span>
            <input value={i.lesson} onChange={(e) => updateIssue(i.id, { lesson: e.target.value })} />
          </label>
        </article>
      ))}

      {sent.some((i) => i.lesson) && (
        <section className="card lessons">
          <h2>Your lessons so far</h2>
          <ol>
            {[...sent].reverse().filter((i) => i.lesson).map((i) => (
              <li key={i.id}><span className="muted">No. {i.number}:</span> {i.lesson}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
