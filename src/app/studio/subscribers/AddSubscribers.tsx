'use client'

import { useActionState, useEffect, useRef } from 'react'
import { site } from '@/lib/site'
import { addSubscribers, type AddState } from '../actions'

export function AddSubscribers() {
  const [state, action, pending] = useActionState<AddState, FormData>(addSubscribers, undefined)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state?.ok) form.current?.reset() }, [state])
  return (
    <form ref={form} action={action} className="mt-8 rounded-xl border border-line bg-sheet p-5">
      <h2 className="font-serif text-xl">Add people who said yes</h2>
      <p className="mt-1 text-sm text-ink-2">One per line: <code>email</code>, <code>email, name</code> or <code>Name &lt;email&gt;</code>. Paste a CSV export the same way.</p>
      <label htmlFor="people" className="sr-only">Email addresses</label>
      <textarea id="people" name="people" rows={4} className="field mt-3 font-mono !text-sm" placeholder={'mum@example.com, Mum\nSam Lee <sam@example.com>'} />
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1 accent-[var(--color-accent)]" />
        <span>Each of these people has told me they want to receive {site.name} by email.</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Adding…' : 'Add readers'}</button>
        {state?.ok && (
          <p role="status" className="text-sm text-ok">
            Added {state.added}. {state.skipped ? `${state.skipped} already on the list (left unchanged). ` : ''}
            {state.invalid?.length ? `${state.invalid.length} invalid line(s) skipped.` : ''}
          </p>
        )}
        {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  )
}
