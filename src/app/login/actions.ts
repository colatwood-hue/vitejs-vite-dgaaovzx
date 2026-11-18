'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkPassword, createSessionToken, SESSION_COOKIE } from '@/lib/auth'

export async function login(_: { error?: string } | undefined, form: FormData) {
  const password = String(form.get('password') ?? '')
  if (!(await checkPassword(password))) {
    await new Promise((r) => setTimeout(r, 400)) // slow down guessing
    return { error: 'That password is not right.' }
  }
  const { token, maxAge } = await createSessionToken()
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
  redirect('/studio')
}

export async function logout() {
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect('/login')
}
