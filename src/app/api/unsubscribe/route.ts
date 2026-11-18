import { unsubscribe } from '@/lib/subscribers'
import { verifyUnsubscribeToken } from '@/lib/tokens'

/** RFC 8058 one-click unsubscribe: mail providers POST here with `List-Unsubscribe=One-Click`. */
export async function POST(req: Request) {
  const id = verifyUnsubscribeToken(new URL(req.url).searchParams.get('token'))
  if (!id) return new Response('Invalid token', { status: 400 })
  await unsubscribe(id)
  return new Response('Unsubscribed', { status: 200 })
}
