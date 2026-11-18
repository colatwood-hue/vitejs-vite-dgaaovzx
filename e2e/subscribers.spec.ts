import { expect, test } from '@playwright/test'
import { emails, linkFrom, login, unique } from './helpers'

test.describe.configure({ mode: 'serial' })

// Each test gets its own client IP so the public rate limit doesn't leak between tests.
let ipCounter = 10
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${ipCounter++}` })
})

async function subscribe(page: import('@playwright/test').Page, email: string, name = '') {
  await page.goto('/')
  if (name) await page.getByLabel('First name').fill(name)
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Subscribe' }).click()
  await expect(page.getByRole('status')).toContainText('Check your inbox')
}

test('double opt-in: subscribe, confirm by email, then appear as active', async ({ page }) => {
  const email = unique('reader')
  await subscribe(page, email, 'Sam')

  const [mail] = emails(email)
  expect(mail.subject).toContain('Confirm your subscription')
  const confirmUrl = linkFrom(mail.html, '/subscribe/confirm')

  // Visiting the link alone (as a link scanner would) confirms nothing
  await page.goto(confirmUrl)
  await login(page)
  await page.goto('/studio/subscribers')
  await expect(page.getByRole('row', { name: new RegExp(email) })).toContainText('Awaiting confirmation')

  await page.goto(confirmUrl)
  await page.getByRole('button', { name: 'Confirm my subscription' }).click()
  await expect(page.getByRole('status')).toContainText("You're in")

  await page.goto('/studio/subscribers')
  const row = page.getByRole('row', { name: new RegExp(email) })
  await expect(row).toContainText('Active')
  await expect(row).toContainText('Signed up')

  // Token is single-use
  await page.goto(confirmUrl)
  await page.getByRole('button', { name: 'Confirm my subscription' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('expired or was already used')

  // Subscribing again as an active reader looks identical but sends nothing (no enumeration)
  await subscribe(page, email)
  expect(emails(email)).toHaveLength(1)
})

test('honeypot submissions are silently dropped', async ({ page }) => {
  const email = unique('bot')
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.locator('#sub-website').fill('http://spam.example', { force: true })
  await page.getByRole('button', { name: 'Subscribe' }).click()
  await expect(page.getByRole('status')).toContainText('Check your inbox')
  expect(emails(email)).toHaveLength(0)
})

test('public signup is rate limited per IP', async ({ page }) => {
  for (let i = 0; i < 5; i++) await subscribe(page, unique('burst'))
  await page.goto('/')
  await page.getByLabel('Email address').fill(unique('burst'))
  await page.getByRole('button', { name: 'Subscribe' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('Too many attempts')
})

test('owner can add consenting readers, and can never resubscribe someone who left', async ({ page }) => {
  await login(page)
  await page.goto('/studio/subscribers')
  const a = unique('mum'), b = unique('friend')

  await page.getByLabel('Email addresses').fill(`${a}, Mum`)
  await page.getByRole('button', { name: 'Add readers' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('Only add people who have told you')

  await page.getByLabel('Email addresses').fill(`${a}, Mum\nFriend <${b}>\nnot-an-email`)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Add readers' }).click()
  await expect(page.getByRole('status')).toContainText('Added 2')
  await expect(page.getByRole('status')).toContainText('1 invalid')
  await expect(page.getByRole('row', { name: new RegExp(a) })).toContainText('Imported')

  // Unsubscribe b, then try to add b again
  page.once('dialog', (d) => d.accept())
  await page.getByRole('row', { name: new RegExp(b) }).getByRole('button', { name: 'Unsubscribe' }).click()
  await expect(page.getByRole('row', { name: new RegExp(b) })).toContainText('Unsubscribed')
  await page.getByLabel('Email addresses').fill(b)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Add readers' }).click()
  await expect(page.getByRole('status')).toContainText('Added 0')
  await expect(page.getByRole('row', { name: new RegExp(b) })).toContainText('Unsubscribed')
})
