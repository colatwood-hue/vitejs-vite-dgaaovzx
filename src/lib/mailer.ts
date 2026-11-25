import 'server-only'
import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export type SendResult = { ok: true; ids: string[] } | { ok: false; error: string }

const RESEND_URL = 'https://api.resend.com'
export const RESEND_BATCH_LIMIT = 100

export function emailConfig() {
  const from = process.env.EMAIL_FROM
  const owner = process.env.OWNER_EMAIL
  return { from, owner, replyTo: owner }
}

function transport(): 'log' | 'resend' | null {
  const explicit = process.env.EMAIL_TRANSPORT
  if (explicit === 'log' || explicit === 'resend') return explicit
  if (process.env.RESEND_API_KEY) return 'resend'
  // Never silently "send" to a log file in production: email is simply off until Resend is set up.
  if (process.env.NODE_ENV === 'production') return null
  return 'log'
}

/** False in production until RESEND_API_KEY is set. Public signup is hidden while this is false. */
export const emailConfigured = () => transport() !== null

/** Development/test transport: one JSON line per email, nothing leaves the machine. */
async function sendLog(batch: OutgoingEmail[]): Promise<SendResult> {
  const file = process.env.EMAIL_LOG_FILE || '.email-log.jsonl'
  const { from, replyTo } = emailConfig()
  const ids = batch.map(() => `log_${randomUUID()}`)
  const lines = batch.map((m, i) => JSON.stringify({ id: ids[i], at: new Date().toISOString(), from, replyTo, ...m }) + '\n').join('')
  await appendFile(file, lines)
  return { ok: true, ids }
}

/** Resend REST API (no SDK). The idempotency key makes a retried batch safe to resend. */
async function sendResend(batch: OutgoingEmail[], idempotencyKey?: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const { from, replyTo } = emailConfig()
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' }
  if (!from) return { ok: false, error: 'EMAIL_FROM is not set' }
  const payload = batch.map((m) => ({
    from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(replyTo && { reply_to: replyTo }),
    ...(m.headers && { headers: m.headers }),
  }))
  try {
    const res = await fetch(`${RESEND_URL}/emails/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
      },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string }[]; message?: string }
    if (!res.ok || !json.data) return { ok: false, error: `Resend ${res.status}: ${json.message ?? 'unknown error'}` }
    return { ok: true, ids: json.data.map((d) => d.id) }
  } catch (e) {
    return { ok: false, error: `Resend request failed: ${(e as Error).message}` }
  }
}

export async function sendEmails(batch: OutgoingEmail[], idempotencyKey?: string): Promise<SendResult> {
  if (batch.length === 0) return { ok: true, ids: [] }
  if (batch.length > RESEND_BATCH_LIMIT) throw new Error(`Batch too large (${batch.length})`)
  const t = transport()
  if (!t) return { ok: false, error: 'Email is not set up yet: add RESEND_API_KEY and EMAIL_FROM.' }
  return t === 'log' ? sendLog(batch) : sendResend(batch, idempotencyKey)
}
