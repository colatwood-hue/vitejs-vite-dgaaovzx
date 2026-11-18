import 'server-only'
import { headers } from 'next/headers'
import { sql } from './db'
import { sha256 } from './tokens'

/** Fixed-window counter in Postgres. Returns true if the call is allowed. Keys are hashed (no raw IPs/emails stored). */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const k = sha256(key)
  const [row] = await sql<{ hits: number }[]>`
    insert into rate_limits (key, window_start, hits) values (${k}, now(), 1)
    on conflict (key) do update set
      hits = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.hits + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning hits`
  return row.hits <= limit
}

export async function clientIp() {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}
