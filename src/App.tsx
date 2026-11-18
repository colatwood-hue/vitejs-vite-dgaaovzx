import { useState } from 'react'
import { emptyIssue, useData, type Idea, type Issue } from './lib/store'
import Ideas from './components/Ideas'
import Write from './components/Write'
import Log from './components/Log'
import Playbook from './components/Playbook'
import Setup from './components/Setup'

type Tab = 'ideas' | 'write' | 'log' | 'playbook' | 'setup'

export default function App() {
  const [data, setData] = useData()
  const [tab, setTab] = useState<Tab>('write')
  const drafts = [...data.issues].sort((a, b) => b.number - a.number)
  const [currentId, setCurrentId] = useState<string | undefined>(drafts[0]?.id)
  const current = data.issues.find((i) => i.id === currentId)

  const updateIssue = (id: string, patch: Partial<Issue>) =>
    setData((d) => ({ ...d, issues: d.issues.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  const newIssue = (idea?: Idea) => {
    const n = Math.max(0, ...data.issues.map((i) => i.number)) + 1
    const issue: Issue = { ...emptyIssue(n), ideaId: idea?.id, bigIdeaTitle: idea?.text ?? '', bigIdea: idea?.notes ?? '' }
    setData((d) => ({
      ...d,
      issues: [...d.issues, issue],
      ideas: idea ? d.ideas.map((i) => (i.id === idea.id ? { ...i, stage: 'used' } : i)) : d.ideas,
    }))
    setCurrentId(issue.id)
    setTab('write')
  }

  const deleteIssue = (id: string) => {
    if (!confirm('Delete this issue? This cannot be undone.')) return
    setData((d) => ({ ...d, issues: d.issues.filter((i) => i.id !== id) }))
    setCurrentId(drafts.find((i) => i.id !== id)?.id)
  }

  const tabs: [Tab, string][] = [
    ['write', '✍️ Write'],
    ['ideas', '🌱 Ideas'],
    ['log', '📈 Log'],
    ['playbook', '📖 Playbook'],
    ['setup', '⚙️ Foundation'],
  ]

  return (
    <div className="app" style={{ '--accent': data.settings.accent } as React.CSSProperties}>
      <nav className="nav">
        <div className="brand">
          <span className="brand-name">{data.settings.name}</span>
          <span className="brand-sub">Newsletter Studio</span>
        </div>
        <div className="tabs">
          {tabs.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {tab === 'write' && (
          <>
            <div className="issue-bar">
              <select value={currentId ?? ''} onChange={(e) => setCurrentId(e.target.value)} aria-label="Choose issue">
                {drafts.length === 0 && <option value="">No issues yet</option>}
                {drafts.map((i) => (
                  <option key={i.id} value={i.id}>
                    No. {i.number}: {i.subject || 'Untitled'} {i.status === 'sent' ? '(sent)' : '(draft)'}
                  </option>
                ))}
              </select>
              <button className="btn primary sm" onClick={() => newIssue()}>+ New issue</button>
            </div>
            {current ? (
              <Write data={data} issue={current} update={(p) => updateIssue(current.id, p)} onDelete={() => deleteIssue(current.id)} />
            ) : (
              <p className="empty card page">Start a new issue, or pick an idea from the Idea Inbox.</p>
            )}
          </>
        )}
        {tab === 'ideas' && <Ideas data={data} setData={setData} onWrite={newIssue} />}
        {tab === 'log' && <Log data={data} updateIssue={updateIssue} onOpen={(id) => { setCurrentId(id); setTab('write') }} />}
        {tab === 'playbook' && <Playbook />}
        {tab === 'setup' && <Setup data={data} setData={setData} />}
      </main>
    </div>
  )
}
