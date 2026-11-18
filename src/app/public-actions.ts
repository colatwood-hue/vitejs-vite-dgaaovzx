'use server'

import { z } from 'zod'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { confirmSubscription, requestSubscription, unsubscribe } from '@/lib/subscribers'
import { verifyUnsubscribeToken } from '@/lib/tokens'

export type PublicState = { ok?: boolean; error?: string } | undefined

const signup = z.object({
  email: z.email('Enter a valid email address').max(254).transform((e) => e.trim().toLowerCase()),
  name: z.string().trim().max(100).default(''),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
})

export async function subscribe(_: PublicState, form: FormData): Promise<PublicState> {
  const raw = { email: String(form.get('email') ?? ''), name: String(form.get('name') ?? ''), website: String(form.get('website') ?? '') }
  if (raw.website) return { ok: true } // bot: pretend success
  const parsed = signup.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const ip = await clientIp()
  if (!(await rateLimit(`sub-ip:${ip}`, 5, 3600)) || !(await rateLimit(`sub-email:${parsed.data.email}`, 3, 86400)))
    return { error: 'Too many attempts. Please try again later.' }
  await requestSubscription(parsed.data.email, parsed.data.name)
  return { ok: true }
}

export async function confirm(_: PublicState, form: FormData): Promise<PublicState> {
  const token = String(form.get('token') ?? '')
  if (!(await rateLimit(`confirm-ip:${await clientIp()}`, 20, 3600))) return { error: 'Too many attempts. Please try again later.' }
  return (await confirmSubscription(token)) ? { ok: true } : { error: 'This link has expired or was already used. Subscribe again to get a new one.' }
}

export async function unsubscribeAction(_: PublicState, form: FormData): Promise<PublicState> {
  const id = verifyUnsubscribeToken(String(form.get('token') ?? ''))
  if (!id) return { error: 'This unsubscribe link is not valid.' }
  await unsubscribe(id)
  return { ok: true }
}
