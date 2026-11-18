'use client'

import { useActionState } from 'react'
import type { PublicState } from '@/app/public-actions'

/** One-button POST form, so link scanners that prefetch GET URLs can't act on the user's behalf. */
export function TokenAction({ action, token, label, done }: {
  action: (s: PublicState, f: FormData) => Promise<PublicState>
  token: string
  label: string
  done: React.ReactNode
}) {
  const [state, run, pending] = useActionState(action, undefined)
  if (state?.ok) return <div className="mt-8 font-serif text-xl" role="status">{done}</div>
  return (
    <form action={run} className="mt-8">
      <input type="hidden" name="token" value={token} />
      <button className="btn btn-primary" disabled={pending}>{pending ? 'One moment…' : label}</button>
      {state?.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}
    </form>
  )
}
