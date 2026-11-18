import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from './auth'

/** Call at the top of every studio page and server action. Proxy alone is not a security boundary. */
export async function requireStudio() {
  const jar = await cookies()
  if (!(await verifySessionToken(jar.get(SESSION_COOKIE)?.value))) redirect('/login')
}
