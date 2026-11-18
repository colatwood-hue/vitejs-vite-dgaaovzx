'use client'

import { useActionState } from 'react'
import { subscribe } from '@/app/public-actions'

export function SubscribeForm() {
  const [state, action, pending] = useActionState(subscribe, undefined)
  if (state?.ok)
    return (
      <div role="status" className="rounded-lg border border-line bg-sheet px-5 py-4">
        <p className="font-serif text-xl">Check your inbox.</p>
        <p className="mt-1 text-sm text-ink-2">If that address isn&apos;t already subscribed, a confirmation link is on its way. It expires in 48 hours.</p>
      </div>
    )
  return (
    <form action={action} className="rounded-lg border border-line bg-sheet p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <label className="sr-only" htmlFor="sub-name">First name</label>
        <input id="sub-name" name="name" autoComplete="given-name" placeholder="First name (optional)" className="field" maxLength={100} />
        <label className="sr-only" htmlFor="sub-email">Email address</label>
        <input id="sub-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="field" maxLength={254} />
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Subscribe'}</button>
      </div>
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="sub-website">Website</label>
        <input id="sub-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
      <p className="mt-2 text-xs text-muted">One email every other Sunday. Unsubscribe in one click, any time. Your address is never shared.</p>
    </form>
  )
}
