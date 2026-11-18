import { expect, test } from '@playwright/test'
import { login, waitSaved } from './helpers'

test.describe.configure({ mode: 'serial' })

test('capture → letter → approve → publish, with approval enforced', async ({ page, request }) => {
  await login(page)

  // Capture
  const note = `Watched my neighbour fix his fence in the rain at 6am ${Date.now()}`
  await page.getByLabel('New entry').fill(note)
  await page.getByLabel('Pillar').selectOption('Living')
  await page.getByRole('button', { name: 'Capture' }).click()
  const card = page.locator('[data-stage="seed"] li', { hasText: note })
  await expect(card).toBeVisible()
  await expect(page.getByLabel('New entry')).toHaveValue('')

  // Start a letter from it
  await card.getByText('Use').click()
  await page.getByRole('button', { name: /Start a letter from 1/ }).click()
  await expect(page).toHaveURL(/\/studio\/issues\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Built from 1 entry')).toBeVisible()
  await expect(page.getByText(note)).toBeVisible()
  const editorUrl = page.url()

  // Approval is blocked while required fields are empty
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('Add a subject line')

  // Write
  await page.getByLabel('Subject line').fill('What the fence taught me')
  await page.getByLabel('Preview text').fill('On showing up when nobody is watching.')
  await page.getByLabel('Headline').fill('The fence at 6am')
  await page.getByLabel('Opening note').fill('A quiet fortnight. Mostly early mornings.')
  await page.getByLabel('The big idea').click()
  await page.keyboard.type('He did not look up once. That was the whole lesson.')
  await page.getByLabel("What I'm learning").fill('- Patience is a practice, not a trait')
  await page.getByLabel('Link 1 title').fill('On craft')
  await page.getByLabel('Link 1 URL').fill('https://example.com/craft')
  await page.getByLabel('Link 1 reason').fill('A short essay on doing things well.')
  await page.getByLabel('A question for you').fill('What do you do well when nobody is watching?')
  await waitSaved(page)

  // Email preview renders the saved content
  const preview = page.frameLocator('iframe[title="Email preview"]')
  await expect(preview.getByText('The fence at 6am')).toBeVisible()
  await expect(preview.getByText('He did not look up once.')).toBeVisible()

  // Not public before publishing
  expect((await request.get('/issues/issue-1')).status()).toBe(404)

  // Approve, then an edit sends it back to draft
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByTestId('status')).toHaveText('approved')
  await page.getByLabel('Opening note').fill('A quiet fortnight. Mostly early mornings, mostly cold.')
  await waitSaved(page)
  await expect(page.getByTestId('status')).toHaveText('draft')
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0)

  // Approve again and publish
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByTestId('status')).toHaveText('approved')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByTestId('status')).toHaveText('published')
  await expect(page.getByTestId('save-state')).toHaveText('Published · read only')

  // Public archive + issue page
  await page.goto('/')
  await page.getByRole('link', { name: /The fence at 6am/ }).click()
  await expect(page).toHaveURL(/\/issues\/1-the-fence-at-6am$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The fence at 6am')
  await expect(page.getByText('He did not look up once.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'On craft' })).toHaveAttribute('href', 'https://example.com/craft')

  // Published issues are locked
  await page.goto(editorUrl)
  await expect(page.getByLabel('Headline')).toBeDisabled()
})

test('unsafe link URLs are rejected on save', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: /Start a letter/ }).click()
  await expect(page).toHaveURL(/\/studio\/issues\//)
  await page.getByLabel('Link 1 URL').fill('javascript:alert(1)')
  await expect(page.getByTestId('save-state')).toHaveText('Save failed', { timeout: 10_000 })
  await expect(page.locator('p[role=alert]')).toContainText('Links must start with http')
  // Clean up the draft
  page.once('dialog', (d) => d.accept())
  await page.getByLabel('Link 1 URL').fill('')
  await page.getByRole('button', { name: 'Delete draft' }).click()
  await expect(page).toHaveURL(/\/studio$/)
})

test('public home has no horizontal scroll on a phone @mobile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
