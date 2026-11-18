import { useMemo, useState } from 'react'
import { CHECKLIST, type Data, type Issue } from '../lib/store'
import { readMinutes, toEmailHtml, toMarkdown, toPlainText, wordCount } from '../lib/render'

interface Props {
  data: Data
  issue: Issue
  update: (patch: Partial<Issue>) => void
  onDelete: () => void
}

const GUIDE: Record<string, string> = {
  subject: 'Specific, curious, honest. Under about 50 characters. Write 3 and keep the best.',
  preview: 'Shown next to the subject in the inbox. Never leave it blank.',
  opening: "2 to 4 sentences. What's going on in your life right now? Warm and a bit casual.",
  bigIdea: 'ONE idea, 300 to 700 words. Shape: the moment → the tension → the insight → the practice → the open edge. Markdown works.',
  learning: '1 to 3 bullets: a book, concept or skill in progress, and what it taught you.',
  links: 'Each link needs one sentence on why. A link without a reason is noise.',
  question: 'One real question tied to the big idea. This is what earns replies.',
}

function Field({ label, guide, children, meta }: { label: string; guide?: string; children: React.ReactNode; meta?: string }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {meta && <span className="muted small">{meta}</span>}
      </span>
      {guide && <span className="guide">{guide}</span>}
      {children}
    </label>
  )
}

export default function Write({ data, issue, update, onDelete }: Props) {
  const [view, setView] = useState<'email' | 'mobile'>('email')
  const [copied, setCopied] = useState('')
  const html = useMemo(() => toEmailHtml(issue, data.settings), [issue, data.settings])
  const words = wordCount(issue)
  const done = CHECKLIST.filter((c) => issue.checklist[c]).length
  const idea = data.ideas.find((i) => i.id === issue.ideaId)

  const copy = async (kind: string, text: string, rich = false) => {
    try {
      if (rich && 'ClipboardItem' in window) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([text], { type: 'text/html' }), 'text/plain': new Blob([toPlainText(issue, data.settings)], { type: 'text/plain' }) }),
        ])
      } else await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      alert('Copy failed. Use Download instead.')
    }
  }

  const download = () => {
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `issue-${issue.number}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const setLink = (idx: number, key: 'title' | 'url' | 'why', v: string) =>
    update({ links: issue.links.map((l, i) => (i === idx ? { ...l, [key]: v } : l)) })

  return (
    <div className="write">
      <div className="editor">
        <div className="row between">
          <h1>Issue No. {issue.number}</h1>
          <span className={`status ${issue.status}`}>{issue.status === 'sent' ? 'Sent' : 'Draft'}</span>
        </div>
        {idea && <p className="muted small">From idea: “{idea.text}”{idea.notes && <> · <i>{idea.notes}</i></>}</p>}

        <p className="stat-line">
          {words} words · ~{readMinutes(issue)} min read · checklist {done}/{CHECKLIST.length}
          {words > 1400 && <span className="warn"> · long issue, consider cutting</span>}
        </p>

        <fieldset>
          <legend>Inbox</legend>
          <Field label="Subject line" guide={GUIDE.subject} meta={`${issue.subject.length} chars`}>
            <input value={issue.subject} onChange={(e) => update({ subject: e.target.value })} className={issue.subject.length > 55 ? 'over' : ''} />
          </Field>
          <div className="alts">
            {issue.subjectAlts.map((alt, i) => (
              <div key={i} className="row">
                <input
                  value={alt}
                  placeholder={`Alternative subject ${i + 2}`}
                  onChange={(e) => update({ subjectAlts: issue.subjectAlts.map((a, j) => (j === i ? e.target.value : a)) })}
                />
                {alt && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    title="Use this one"
                    onClick={() => update({ subject: alt, subjectAlts: issue.subjectAlts.map((a, j) => (j === i ? issue.subject : a)) })}
                  >
                    ⇅ Swap
                  </button>
                )}
              </div>
            ))}
          </div>
          <Field label="Preview text" guide={GUIDE.preview}>
            <input value={issue.preview} onChange={(e) => update({ preview: e.target.value })} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>The letter</legend>
          <Field label="Opening note" guide={GUIDE.opening}>
            <textarea rows={3} value={issue.opening} onChange={(e) => update({ opening: e.target.value })} />
          </Field>
          <Field label="Headline" guide="The title of your big idea, shown at the top of the email.">
            <input value={issue.bigIdeaTitle} onChange={(e) => update({ bigIdeaTitle: e.target.value })} />
          </Field>
          <Field label="The big idea" guide={GUIDE.bigIdea}>
            <textarea rows={16} value={issue.bigIdea} onChange={(e) => update({ bigIdea: e.target.value })} />
          </Field>
          <Field label="What I'm learning" guide={GUIDE.learning}>
            <textarea rows={3} value={issue.learning} onChange={(e) => update({ learning: e.target.value })} />
          </Field>
          <div className="field">
            <span className="field-label">Worth your time</span>
            <span className="guide">{GUIDE.links}</span>
            {issue.links.map((l, i) => (
              <div key={i} className="link-row">
                <input placeholder="Title" value={l.title} onChange={(e) => setLink(i, 'title', e.target.value)} />
                <input placeholder="https://…" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} />
                <input placeholder="Why it's worth their time" value={l.why} onChange={(e) => setLink(i, 'why', e.target.value)} />
                <button type="button" className="btn ghost sm" onClick={() => update({ links: issue.links.filter((_, j) => j !== i) })} aria-label="Remove link">
                  ✕
                </button>
              </div>
            ))}
            {issue.links.length < 3 && (
              <button type="button" className="btn ghost sm" onClick={() => update({ links: [...issue.links, { title: '', url: '', why: '' }] })}>
                + Add link
              </button>
            )}
          </div>
          <Field label="A question for you" guide={GUIDE.question}>
            <textarea rows={2} value={issue.question} onChange={(e) => update({ question: e.target.value })} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>Before you send</legend>
          <ul className="checklist">
            {CHECKLIST.map((c) => (
              <li key={c}>
                <label>
                  <input type="checkbox" checked={!!issue.checklist[c]} onChange={(e) => update({ checklist: { ...issue.checklist, [c]: e.target.checked } })} />
                  {c}
                </label>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            {issue.status === 'draft' ? (
              <button
                className="btn primary"
                onClick={() => {
                  if (done < CHECKLIST.length && !confirm(`Only ${done}/${CHECKLIST.length} checklist items are done. Mark as sent anyway?`)) return
                  update({ status: 'sent', sentAt: new Date().toISOString() })
                }}
              >
                📬 Mark as sent
              </button>
            ) : (
              <button className="btn ghost" onClick={() => update({ status: 'draft' })}>
                Back to draft
              </button>
            )}
            <button className="btn ghost danger" onClick={onDelete}>
              Delete issue
            </button>
          </div>
        </fieldset>
      </div>

      <aside className="preview">
        <div className="preview-bar">
          <div className="seg">
            <button className={view === 'email' ? 'on' : ''} onClick={() => setView('email')}>Desktop</button>
            <button className={view === 'mobile' ? 'on' : ''} onClick={() => setView('mobile')}>Phone</button>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => copy('rich', html, true)} title="Paste straight into Gmail, Kit, Beehiiv or Substack">
              {copied === 'rich' ? '✓ Copied' : 'Copy email'}
            </button>
            <button className="btn sm ghost" onClick={() => copy('html', html)}>{copied === 'html' ? '✓' : 'HTML'}</button>
            <button className="btn sm ghost" onClick={() => copy('md', toMarkdown(issue, data.settings))}>{copied === 'md' ? '✓' : 'Markdown'}</button>
            <button className="btn sm ghost" onClick={() => copy('txt', toPlainText(issue, data.settings))}>{copied === 'txt' ? '✓' : 'Text'}</button>
            <button className="btn sm ghost" onClick={download}>⬇</button>
          </div>
        </div>
        <div className="inbox-peek">
          <b>{data.settings.author}</b>
          <span>
            <b>{issue.subject || 'No subject yet'}</b> <span className="muted">– {issue.preview || 'No preview text (fill this in)'}</span>
          </span>
        </div>
        <div className={`frame-wrap ${view}`}>
          <iframe title="Email preview" srcDoc={html} />
        </div>
      </aside>
    </div>
  )
}
