'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { deleteCaptureAction, promoteCaptureAction } from '../actions'

export function CaptureActions({ id, promotedEntryId }: { id: string; promotedEntryId: string | null }) {
  const [pending, start] = useTransition()
  const [promoted, setPromoted] = useState(promotedEntryId)
  const [error, setError] = useState('')
  return (
    <section className="mt-10 rounded-xl border border-line bg-sheet p-4">
      <div className="flex flex-wrap items-center gap-2">
        {promoted ? (
          <p role="status" className="text-sm">✓ In your newsletter ideas. <Link href="/studio" className="text-accent underline">Open ideas</Link></p>
        ) : (
          <button className="btn btn-accent" disabled={pending}
            onClick={() => start(async () => { const r = await promoteCaptureAction(id); if (r?.error) setError(r.error); else setPromoted(r?.id ?? null) })}>
            Promote to newsletter
          </button>
        )}
        <button className="btn btn-ghost ml-auto !text-danger" disabled={pending}
          onClick={() => confirm('Delete this item and its attachments permanently? A newsletter idea made from it is kept.') && start(() => deleteCaptureAction(id))}>
          Delete
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Promoting creates a separate idea in your newsletter inbox and leaves this item unchanged. Nothing is published without your approval.</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}
