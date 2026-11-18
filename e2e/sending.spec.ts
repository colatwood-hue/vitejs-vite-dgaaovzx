import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { OWNER_EMAIL, WEBHOOK_SECRET } from '../playwright.config'
import { createApprovedIssue, emails, login, publish, unique, waitSaved } from './helpers'

test.describe.configure({ mode: 'serial' })

function signed(body: string, id: string, ts = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(WEBHOOK_SECRET.replace('whsec_', ''), 'base64')
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` }
}

const readers = [unique('alpha'), unique('beta'), unique('gamma')]
const deliveredTo: Record<string, { id: string; oneClick: string; page: string }> = {}

test('send requires a fresh test, publication and a typed confirmation; then each reader gets a personal unsubscribe', async ({ page }) => {
  await login(page)
  // Readers: add consenting people
  await page.goto('/studio/subscribers')
  await page.getByLabel('Email addresses').fill(readers.join('\n'))
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Add readers' }).click()
  await expect(page.getByRole('status')).toContainText('Added 3')
  const active = Number(await page.getByTestId('count-active').textContent())

  await createApprovedIssue(page, 'Letters by hand')
  const panel = page.getByTestId('send-panel')

  // Test send goes only to the owner
  const before = emails().length
  await panel.getByRole('button', { name: 'Send test' }).click()
  await expect(panel.getByRole('status')).toContainText(`Test sent to ${OWNER_EMAIL}`)
  const test1 = emails(OWNER_EMAIL).at(-1)!
  expect(test1.subject).toBe('[TEST] Letters by hand')
  expect(emails().length).toBe(before + 1)

  // Editing after the test returns it to draft; re-approval makes the old test stale
  await page.getByLabel('Opening note').fill('Changed after the test.')
  await waitSaved(page)
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByTestId('status')).toHaveText('approved')
  await expect(panel).not.toContainText('done for this version')
  await publish(page)
  await expect(panel.getByRole('button', { name: 'Send letter' })).toBeDisabled()

  await panel.getByRole('button', { name: 'Send test' }).click()
  await expect(panel).toContainText('done for this version')

  // Typed confirmation must match the recipient count
  const input = panel.getByLabel('Confirm recipient count')
  await input.fill(String(active + 1))
  await expect(panel.getByRole('button', { name: 'Send letter' })).toBeDisabled()
  await input.fill(String(active))
  await panel.getByRole('button', { name: 'Send letter' }).click()
  await expect(page.getByTestId('send-result')).toHaveText(`Sent to ${active} of ${active} readers`)

  // Exactly one email per active reader, each with RFC 8058 one-click headers and its own token
  for (const r of readers) {
    const mine = emails(r)
    expect(mine).toHaveLength(1)
    const m = mine[0]
    expect(m.subject).toBe('Letters by hand')
    expect(m.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const oneClick = m.headers!['List-Unsubscribe'].slice(1, -1)
    const pageUrl = m.html.match(/href="([^"]*\/unsubscribe\?token=[^"]*)"/)![1].replace(/&amp;/g, '&')
    deliveredTo[r] = { id: m.id, oneClick, page: pageUrl }
  }
  expect(new Set(Object.values(deliveredTo).map((d) => d.oneClick)).size).toBe(3)

  // It can only be sent once: the panel now shows the result, not a send button
  await page.reload()
  await expect(panel.getByRole('button', { name: 'Send letter' })).toHaveCount(0)
})

test('one-click unsubscribe (RFC 8058) and the unsubscribe page both work; forged tokens fail', async ({ page, request }) => {
  const a = deliveredTo[readers[0]], b = deliveredTo[readers[1]]

  expect((await request.post(a.oneClick, { data: 'List-Unsubscribe=One-Click' })).status()).toBe(200)
  const forged = a.oneClick.replace(/token=[^.]+/, 'token=00000000-0000-0000-0000-000000000000')
  expect((await request.post(forged)).status()).toBe(400)

  await page.goto(b.page)
  await page.getByRole('button', { name: 'Unsubscribe me' }).click()
  await expect(page.getByRole('status')).toContainText("Done. You won't get any more letters.")

  await login(page)
  await page.goto('/studio/subscribers')
  await expect(page.getByRole('row', { name: new RegExp(readers[0]) })).toContainText('Unsubscribed')
  await expect(page.getByRole('row', { name: new RegExp(readers[1]) })).toContainText('Unsubscribed')
})

test('Resend webhooks: signature checked, bounces suppress the reader, replays are ignored', async ({ page, request }) => {
  const c = deliveredTo[readers[2]]
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: c.id } })

  expect((await request.post('/api/webhooks/resend', { data: body, headers: { 'content-type': 'application/json', 'svix-id': 'msg_x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,bad' } })).status()).toBe(401)
  expect((await request.post('/api/webhooks/resend', { data: body, headers: signed(body, 'msg_old', Math.floor(Date.now() / 1000) - 3600) })).status()).toBe(401)

  const ok = await request.post('/api/webhooks/resend', { data: body, headers: signed(body, 'msg_bounce_1') })
  expect(ok.status()).toBe(200)
  const replay = await request.post('/api/webhooks/resend', { data: body, headers: signed(body, 'msg_bounce_1') })
  expect(await replay.text()).toBe('Already processed')

  await login(page)
  await page.goto('/studio/subscribers')
  await expect(page.getByRole('row', { name: new RegExp(readers[2]) })).toContainText('Bounced')
})
