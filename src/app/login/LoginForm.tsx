'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <form action={action} className="mt-8 space-y-3">
      <label className="block text-sm font-medium" htmlFor="password">Studio password</label>
      <input id="password" name="password" type="password" required autoFocus autoComplete="current-password" className="field" />
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Enter the studio'}</button>
    </form>
  )
}
