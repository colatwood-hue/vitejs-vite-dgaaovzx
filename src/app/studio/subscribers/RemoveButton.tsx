'use client'

import { useTransition } from 'react'
import { removeSubscriber } from '../actions'

export function RemoveButton({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition()
  return (
    <button className="btn btn-ghost btn-sm !text-muted" disabled={pending}
      onClick={() => confirm(`Unsubscribe ${email}? They'd have to sign up again themselves.`) && start(() => removeSubscriber(id))}>
      Unsubscribe
    </button>
  )
}
