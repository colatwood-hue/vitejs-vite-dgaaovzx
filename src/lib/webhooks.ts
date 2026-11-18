import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_S = 5 * 60

/**
 * Verifies a Resend webhook (Svix scheme): HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
 * base64 secret after the `whsec_` prefix. The signature header may hold several space-separated `v1,<sig>` values.
 */
export function verifySvix(body: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('svix-id')
  const ts = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !ts || !sigHeader || !/^\d+$/.test(ts)) return false
  if (Math.abs(now / 1000 - Number(ts)) > TOLERANCE_S) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64'))
  return sigHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const got = Buffer.from(sig)
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}
