import { readFileSync, existsSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { EMAIL_LOG, TEST_PASSWORD } from '../playwright.config'

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Studio password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await expect(page).toHaveURL(/\/studio$/)
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved', { timeout: 10_000 })
}

export interface LoggedEmail { id: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }

export function emails(to?: string): LoggedEmail[] {
  if (!existsSync(EMAIL_LOG)) return []
  const all = readFileSync(EMAIL_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LoggedEmail)
  return to ? all.filter((e) => e.to === to) : all
}

export const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

export function linkFrom(html: string, path: string) {
  const m = html.match(new RegExp(`href="(http[^"]*${path.replace('/', '\\/')}[^"]*)"`))
  if (!m) throw new Error(`No ${path} link in email`)
  return m[1].replace(/&amp;/g, '&')
}

/** Creates a complete issue through the UI and approves it. Returns the editor URL. */
export async function createApprovedIssue(page: Page, title: string) {
  await page.goto('/studio')
  await page.getByLabel('New entry').fill(`Raw note for ${title}`)
  await page.getByRole('button', { name: 'Capture' }).click()
  const card = page.locator('[data-stage="seed"] li', { hasText: `Raw note for ${title}` })
  await card.getByText('Use').click()
  await page.getByRole('button', { name: /Start a letter from 1/ }).click()
  await expect(page).toHaveURL(/\/studio\/issues\/[0-9a-f-]{36}$/)
  await page.getByLabel('Subject line').fill(title)
  await page.getByLabel('Preview text').fill('A preview line.')
  await page.getByLabel('Headline').fill(title)
  await page.getByLabel('The big idea').click()
  await page.keyboard.type('One idea, told plainly.')
  await waitSaved(page)
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByTestId('status')).toHaveText('approved')
  return page.url()
}

export async function publish(page: Page) {
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByTestId('status')).toHaveText('published')
}
