// Studio session: a signed, expiring cookie. Uses Web Crypto so it runs in proxy and server code.
// Milestone 2 replaces this with Supabase Auth (magic link, single allowlisted owner).
export const SESSION_COOKIE = 'dash_session'
const MAX_AGE_S = 60 * 60 * 24 * 14

const enc = new TextEncoder()

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters')
  return s
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Buffer.from(sig).toString('base64url')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(now = Date.now()) {
  const exp = String(Math.floor(now / 1000) + MAX_AGE_S)
  return { token: `${exp}.${await hmac(exp)}`, maxAge: MAX_AGE_S }
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || !/^\d+$/.test(exp)) return false
  if (Number(exp) * 1000 < now) return false
  return safeEqual(sig, await hmac(exp))
}

/** Constant-time password check, comparing HMACs so lengths never leak. */
export async function checkPassword(input: string) {
  const expected = process.env.STUDIO_PASSWORD
  if (!expected) return false
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${expected}`))
}
