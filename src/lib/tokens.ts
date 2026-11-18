import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const randomToken = () => randomBytes(32).toString('base64url')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function tokenSecret() {
  const s = process.env.TOKEN_SECRET
  if (!s || s.length < 32) throw new Error('TOKEN_SECRET must be set to at least 32 characters')
  return s
}

const sign = (purpose: string, id: string) => createHmac('sha256', tokenSecret()).update(`${purpose}:${id}`).digest('base64url')

/**
 * Stateless signed unsubscribe token: `<subscriberId>.<hmac>`. Nothing is stored, it never expires
 * (unsubscribe links in old emails must keep working), and it can't be forged without TOKEN_SECRET.
 * Keep TOKEN_SECRET separate from SESSION_SECRET so rotating sessions never breaks old emails.
 */
export const unsubscribeToken = (subscriberId: string) => `${subscriberId}.${sign('unsub', subscriberId)}`

export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const id = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1))
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const expected = Buffer.from(sign('unsub', id))
  return sig.length === expected.length && timingSafeEqual(sig, expected) ? id : null
}
