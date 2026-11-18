import 'server-only'
import { render } from '@react-email/render'
import ConfirmEmail from '@/emails/ConfirmEmail'
import { sql } from './db'
import { sendEmails } from './mailer'
import { site } from './site'
import { randomToken, sha256 } from './tokens'

export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed' | 'bounced' | 'complained'
export interface Subscriber {
  id: string
  email: string
  name: string
  status: SubscriberStatus
  consent_source: 'web_form' | 'personal_invite' | 'import'
  consent_at: Date | null
  created_at: Date
}

const CONFIRM_TTL_HOURS = 48

export const listSubscribers = () =>
  sql<Subscriber[]>`select id, email, name, status, consent_source, consent_at, created_at from subscribers order by created_at desc limit 5000`

export async function subscriberCounts() {
  const rows = await sql<{ status: SubscriberStatus; n: number }[]>`select status, count(*)::int as n from subscribers group by status`
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<SubscriberStatus, number>>
}

/**
 * Public signup (double opt-in). Always resolves the same way to the caller so the form
 * can't be used to discover who is subscribed. Active, bounced and complained addresses are left alone.
 */
export async function requestSubscription(email: string, name: string) {
  const token = randomToken()
  const [row] = await sql<{ id: string }[]>`
    insert into subscribers (email, name, status, consent_source, confirm_token_hash, confirm_expires_at, confirm_sent_at)
    values (${email}, ${name}, 'pending', 'web_form', ${sha256(token)}, now() + make_interval(hours => ${CONFIRM_TTL_HOURS}), now())
    on conflict (email) do update set
      status = 'pending',
      name = case when excluded.name <> '' then excluded.name else subscribers.name end,
      consent_source = 'web_form',
      confirm_token_hash = excluded.confirm_token_hash,
      confirm_expires_at = excluded.confirm_expires_at,
      confirm_sent_at = now()
    where subscribers.status in ('pending', 'unsubscribed')
    returning id`
  if (!row) return // already active / suppressed: send nothing
  const confirmUrl = `${site.url}/subscribe/confirm?token=${encodeURIComponent(token)}`
  const props = { siteName: site.name, author: site.author, confirmUrl, description: site.description }
  const result = await sendEmails([
    {
      to: email,
      subject: `Confirm your subscription to ${site.name}`,
      html: await render(ConfirmEmail(props)),
      text: await render(ConfirmEmail(props), { plainText: true }),
    },
  ])
  if (!result.ok) console.error('confirmation email failed:', result.error)
}

export async function confirmSubscription(token: string) {
  const rows = await sql`
    update subscribers set status = 'active', consent_at = now(), confirm_token_hash = null, confirm_expires_at = null
    where confirm_token_hash = ${sha256(token)} and status = 'pending' and confirm_expires_at > now()
    returning id`
  return rows.length > 0
}

export async function unsubscribe(subscriberId: string) {
  await sql`
    update subscribers set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null
    where id = ${subscriberId} and status in ('active', 'pending')`
}

/**
 * Owner adds people who said yes in person. Existing rows are never changed, so this
 * can't resubscribe someone who unsubscribed or bounced.
 */
export async function addConsented(people: { email: string; name: string }[], source: 'personal_invite' | 'import') {
  if (people.length === 0) return 0
  const rows = await sql`
    insert into subscribers ${sql(people.map((p) => ({ email: p.email, name: p.name, status: 'active', consent_source: source, consent_at: new Date() })))}
    on conflict (email) do nothing
    returning id`
  return rows.length
}
