'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { retrySend, sendIssue, sendTest } from '../../actions'

export interface SendPanelProps {
  issueId: string
  status: 'draft' | 'approved' | 'published'
  ownerEmail: string | null
  testIsCurrent: boolean
  activeCount: number
  send: null | {
    id: string
    status: 'sending' | 'sent' | 'partial'
    recipients: number
    createdAt: string
    counts: Partial<Record<'queued' | 'sent' | 'failed' | 'delivered' | 'bounced' | 'complained', number>>
  }
}

export function SendPanel(p: SendPanelProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})

  const act = (fn: () => Promise<{ error?: string; ok?: boolean; to?: string; failed?: number }>, okText: (r: { to?: string; failed?: number }) => string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.error ? { error: r.error } : { ok: okText(r) })
      router.refresh()
    })

  if (p.status === 'draft') return null

  if (p.send) {
    const c = p.send.counts
    return (
      <section className="rounded-xl border border-line bg-sheet p-5" data-testid="send-panel">
        <h2 className="eyebrow">Email</h2>
        <p className="mt-2 font-serif text-xl" data-testid="send-result">
          {p.send.status === 'sending' ? 'Sending…' : `Sent to ${(c.sent ?? 0) + (c.delivered ?? 0) + (c.bounced ?? 0) + (c.complained ?? 0)} of ${p.send.recipients} readers`}
        </p>
        <p className="text-xs text-muted">{new Date(p.send.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {(['delivered', 'sent', 'failed', 'bounced', 'complained', 'queued'] as const).filter((k) => c[k]).map((k) => (
            <div key={k}><dt className="inline text-muted capitalize">{k === 'sent' ? 'accepted' : k}</dt> <dd className="inline font-semibold">{c[k]}</dd></div>
          ))}
        </dl>
        {(p.send.status === 'partial' || p.send.status === 'sending') && (
          <button className="btn mt-4" disabled={pending} onClick={() => act(() => retrySend(p.issueId, p.send!.id), (r) => (r.failed ? `${r.failed} still failing.` : 'All caught up.'))}>
            {pending ? 'Retrying…' : 'Retry unsent'}
          </button>
        )}
        {msg.error && <p role="alert" className="mt-3 text-sm text-danger">{msg.error}</p>}
        {msg.ok && <p role="status" className="mt-3 text-sm text-ok">{msg.ok}</p>}
      </section>
    )
  }

  const canSend = p.status === 'published' && p.testIsCurrent && p.activeCount > 0
  return (
    <section className="rounded-xl border border-line bg-sheet p-5" data-testid="send-panel">
      <h2 className="eyebrow">Email</h2>
      <ol className="mt-3 space-y-4 text-sm">
        <li>
          <p className="font-semibold">1. Send yourself a test {p.testIsCurrent && <span className="ml-1 font-normal text-ok">✓ done for this version</span>}</p>
          <p className="text-muted">{p.ownerEmail ? <>Goes to {p.ownerEmail}. Check it on your phone.</> : 'Set OWNER_EMAIL to enable test sends.'}</p>
          <button className="btn btn-sm mt-2" disabled={pending || !p.ownerEmail}
            onClick={() => act(() => sendTest(p.issueId), (r) => `Test sent to ${r.to}.`)}>
            Send test
          </button>
        </li>
        <li>
          <p className="font-semibold">2. Publish</p>
          <p className="text-muted">{p.status === 'published' ? '✓ Published' : 'Publish above first. The email links to the web version.'}</p>
        </li>
        <li>
          <p className="font-semibold">3. Send to {p.activeCount} {p.activeCount === 1 ? 'reader' : 'readers'}</p>
          <p className="text-muted">This happens once and can&apos;t be undone. Type <b>{p.activeCount}</b> to confirm.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="confirm-count">Confirm recipient count</label>
            <input id="confirm-count" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} className="field !w-28" disabled={!canSend} />
            <button className="btn btn-accent" disabled={pending || !canSend || typed !== String(p.activeCount)}
              onClick={() => act(() => sendIssue(p.issueId, Number(typed)), (r) => (r.failed ? `Sent, but ${r.failed} failed.` : 'Sent.'))}>
              {pending ? 'Sending…' : 'Send letter'}
            </button>
          </div>
        </li>
      </ol>
      {msg.error && <p role="alert" className="mt-3 text-sm text-danger">{msg.error}</p>}
      {msg.ok && <p role="status" className="mt-3 text-sm text-ok">{msg.ok}</p>}
    </section>
  )
}
