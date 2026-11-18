import 'server-only'
import { render } from '@react-email/render'
import IssueEmail from '@/emails/IssueEmail'
import { sql } from './db'
import { issueEmailProps } from './email'
import { getIssue, type Issue } from './issues'
import { emailConfig, RESEND_BATCH_LIMIT, sendEmails } from './mailer'
import { site } from './site'
import { unsubscribeToken } from './tokens'

const UNSUB_PLACEHOLDER = '__DASH_UNSUBSCRIBE_URL__'

export interface SendSummary {
  id: string
  status: 'sending' | 'sent' | 'partial'
  recipients: number
  created_at: Date
  counts: Partial<Record<'queued' | 'sent' | 'failed' | 'delivered' | 'bounced' | 'complained', number>>
}

export async function getSendSummary(issueId: string): Promise<SendSummary | null> {
  const [send] = await sql<Omit<SendSummary, 'counts'>[]>`select id, status, recipients, created_at from sends where issue_id = ${issueId}`
  if (!send) return null
  const rows = await sql<{ status: keyof SendSummary['counts']; n: number }[]>`
    select status, count(*)::int as n from deliveries where send_id = ${send.id} group by status`
  return { ...send, counts: Object.fromEntries(rows.map((r) => [r.status, r.n])) }
}

export const activeSubscriberCount = async () =>
  (await sql<{ n: number }[]>`select count(*)::int as n from subscribers where status = 'active'`)[0].n

/** Render once with a placeholder, then personalise per recipient. */
async function renderTemplate(issue: Issue, withUnsubscribe: boolean) {
  const props = { ...issueEmailProps(issue), unsubscribeUrl: withUnsubscribe ? UNSUB_PLACEHOLDER : undefined }
  return { html: await render(IssueEmail(props)), text: await render(IssueEmail(props), { plainText: true }) }
}

export async function sendTestEmail(issueId: string) {
  const issue = await getIssue(issueId)
  if (!issue) return { error: 'Issue not found' }
  if (issue.status === 'draft') return { error: 'Approve the issue before sending a test.' }
  const { owner } = emailConfig()
  if (!owner) return { error: 'Set OWNER_EMAIL so test sends have somewhere to go.' }
  const t = await renderTemplate(issue, true)
  const url = `${site.url}/unsubscribe?token=test`
  const res = await sendEmails([{ to: owner, subject: `[TEST] ${issue.subject}`, html: t.html.replaceAll(UNSUB_PLACEHOLDER, url), text: t.text.replaceAll(UNSUB_PLACEHOLDER, url) }])
  if (!res.ok) return { error: res.error }
  await sql`update issues set test_sent_at = now() where id = ${issue.id}`
  return { ok: true as const, to: owner }
}

/**
 * Creates the one send for this issue and queues a delivery per active subscriber.
 * Guards: issue published, a test sent after the latest approval, the owner typed the exact
 * recipient count, and no previous send (unique constraint).
 */
export async function startSend(issueId: string, typedCount: number) {
  const issue = await getIssue(issueId)
  if (!issue) return { error: 'Issue not found' }
  if (issue.status !== 'published') return { error: 'Publish the issue before sending it.' }
  if (!issue.test_sent_at || !issue.approved_at || issue.test_sent_at < issue.approved_at)
    return { error: 'Send yourself a test of this version first.' }

  const sendId = await sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from subscribers where status = 'active'`
    if (n === 0) return { error: 'There are no active subscribers yet.' }
    if (typedCount !== n) return { error: `Type ${n} to confirm the number of recipients.` }
    const [send] = await tx<{ id: string }[]>`
      insert into sends (issue_id, recipients, confirmed_at) values (${issue.id}, ${n}, now())
      on conflict (issue_id) do nothing returning id`
    if (!send) return { error: 'This issue has already been sent.' }
    await tx`
      insert into deliveries (send_id, subscriber_id)
      select ${send.id}, id from subscribers where status = 'active'`
    return send.id
  })
  if (typeof sendId !== 'string') return sendId
  return processSend(sendId, `retry-${Date.now()}`)
}

/** Sends queued deliveries in batches. Safe to call again to resume after a crash. */
/** `attempt` changes the idempotency key, so a deliberate retry isn't deduplicated against the failed call. */
export async function processSend(sendId: string, attempt = 'initial') {
  const [send] = await sql<{ issue_id: string }[]>`select issue_id from sends where id = ${sendId}`
  if (!send) return { error: 'Send not found' }
  const issue = await getIssue(send.issue_id)
  if (!issue) return { error: 'Issue not found' }
  const t = await renderTemplate(issue, true)

  for (;;) {
    const batch = await sql<{ id: string; subscriber_id: string; email: string }[]>`
      select d.id, d.subscriber_id, s.email from deliveries d join subscribers s on s.id = d.subscriber_id
      where d.send_id = ${sendId} and d.status = 'queued' order by d.id limit ${RESEND_BATCH_LIMIT}`
    if (batch.length === 0) break

    // Anyone who unsubscribed or bounced since the send started is skipped.
    const stillActive = new Set(
      (await sql<{ id: string }[]>`select id from subscribers where status = 'active' and id in ${sql(batch.map((b) => b.subscriber_id))}`).map((r) => r.id),
    )
    const skipped = batch.filter((b) => !stillActive.has(b.subscriber_id))
    if (skipped.length) await sql`update deliveries set status = 'failed', error = 'no longer subscribed' where id in ${sql(skipped.map((s) => s.id))}`
    const ready = batch.filter((b) => stillActive.has(b.subscriber_id))
    if (ready.length === 0) continue

    const emails = ready.map((d) => {
      const token = unsubscribeToken(d.subscriber_id)
      const pageUrl = `${site.url}/unsubscribe?token=${encodeURIComponent(token)}`
      const oneClick = `${site.url}/api/unsubscribe?token=${encodeURIComponent(token)}`
      return {
        to: d.email,
        subject: issue.subject,
        html: t.html.replaceAll(UNSUB_PLACEHOLDER, pageUrl),
        text: t.text.replaceAll(UNSUB_PLACEHOLDER, pageUrl),
        headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }
    })
    const res = await sendEmails(emails, `dash-${sendId}-${attempt}-${ready[0].id}`)
    if (res.ok) {
      await sql.begin(async (tx) => {
        for (let i = 0; i < ready.length; i++) {
          await tx`update deliveries set status = 'sent', provider_id = ${res.ids[i] ?? null} where id = ${ready[i].id}`
        }
      })
    } else {
      await sql`update deliveries set status = 'failed', error = ${res.error.slice(0, 500)} where id in ${sql(ready.map((r) => r.id))}`
    }
  }

  const [{ failed }] = await sql<{ failed: number }[]>`
    select count(*) filter (where status = 'failed' and error <> 'no longer subscribed')::int as failed from deliveries where send_id = ${sendId}`
  await sql`update sends set status = ${failed > 0 ? 'partial' : 'sent'}, completed_at = now() where id = ${sendId}`
  return { ok: true as const, failed }
}

/** Re-queue deliveries that failed for provider reasons, then resume. */
export async function retryFailed(sendId: string) {
  await sql`update deliveries set status = 'queued', error = null where send_id = ${sendId} and status = 'failed' and error <> 'no longer subscribed'`
  await sql`update sends set status = 'sending', completed_at = null where id = ${sendId}`
  return processSend(sendId, `retry-${Date.now()}`)
}
