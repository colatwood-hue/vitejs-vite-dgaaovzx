import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const QUOTE = `The obstacle is the way ${stamp}`
const REACTION = `This reframes every setback as raw material zephyrine${stamp}`
let quoteUrl = ''

async function openCapture(page: Page) {
  await page.goto('/studio/capture')
  await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible()
}

test('library, capture, attachments and export are private', async ({ request }) => {
  for (const path of ['/studio/library', '/studio/capture', '/studio/export', '/studio/attachments/00000000-0000-0000-0000-000000000000']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect([307, 401], path).toContain(res.status())
  }
})

test('a quote keeps original text, provenance and reaction as separate fields, with tags and a file', async ({ page }) => {
  await login(page)
  await openCapture(page)
  await page.getByText('Quote', { exact: true }).click()
  await page.getByLabel('The quote, word for word').fill(QUOTE)
  await page.getByLabel('Link').fill('https://example.com/stoics')
  await page.getByLabel('By (author, speaker, account)').fill('Marcus Aurelius')
  await page.getByLabel('From (book, film, show, place)').fill('Meditations')
  await page.getByLabel('Where in it (page, timestamp)').fill('Book 5.20')
  await page.getByLabel('When you encountered it').fill('2026-11-01')
  await page.getByLabel('Your reaction').fill(REACTION)
  await page.getByLabel('Tags, comma-separated').fill('Stoicism, #Setbacks')
  await page.getByLabel(/Attach files/).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(`margin notes ${stamp}`) })
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
  await expect(page.getByLabel('The quote, word for word')).toHaveCount(0) // form reset to "Thought"

  await page.getByRole('link', { name: 'Open it' }).click()
  await expect(page).toHaveURL(/\/studio\/library\/[0-9a-f-]{36}$/)
  quoteUrl = page.url()
  await expect(page.getByTestId('capture-kind')).toHaveText('Quote')
  await expect(page.getByTestId('original')).toHaveText(QUOTE)
  await expect(page.getByTestId('provenance')).toContainText('Marcus Aurelius, Meditations, Book 5.20')
  await expect(page.getByTestId('provenance').getByRole('link')).toHaveAttribute('href', 'https://example.com/stoics')
  await expect(page.getByTestId('reaction')).toHaveText(REACTION)
  await expect(page.getByRole('heading', { name: 'Your reaction' })).toBeVisible()
  await expect(page.getByTestId('timestamps')).toContainText('encountered Nov 1, 2026')
  await expect(page.getByRole('link', { name: '#stoicism' })).toBeVisible()
  await expect(page.getByRole('link', { name: '#setbacks' })).toBeVisible()

  const href = await page.getByTestId('attachment-link').getAttribute('href')
  const file = await page.request.get(href!)
  expect(file.status()).toBe(200)
  expect(await file.text()).toBe(`margin notes ${stamp}`)
  expect(file.headers()['content-disposition']).toContain('attachment')
  expect(file.headers()['x-content-type-options']).toBe('nosniff')
})

test('a thought is stored as Col’s own words, not as a source', async ({ page }) => {
  await login(page)
  await openCapture(page)
  await page.getByLabel('In your own words').fill(`Rest is part of the work, not a reward for it ${stamp}`)
  await page.getByRole('button', { name: 'Save to library' }).click()
  await page.getByRole('link', { name: 'Open it' }).click()
  await expect(page.getByRole('heading', { name: 'Your words' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Original source' })).toHaveCount(0)
})

test('voice notes can be recorded in the browser and played back', async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  await login(page)
  await openCapture(page)
  await page.getByRole('button', { name: /Record voice note/ }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Stop/ }).click()
  await expect(page.locator('form audio')).toBeVisible()
  await page.getByRole('button', { name: 'Save to library' }).click()
  await page.getByRole('link', { name: 'Open it' }).click()
  const audio = page.locator('article audio')
  await expect(audio).toBeVisible()
  const res = await page.request.get((await audio.getAttribute('src'))!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/^audio\//)
  expect((await res.body()).length).toBeGreaterThan(500)
})

test('unsafe input is rejected: unsupported file types and non-http links', async ({ page }) => {
  await login(page)
  await openCapture(page)
  await page.getByLabel('In your own words').fill('has a bad file')
  await page.getByLabel(/Attach files/).setInputFiles({ name: 'evil.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') })
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.locator('p[role=alert]')).toContainText("isn't supported")

  await openCapture(page)
  await page.getByText('Quote', { exact: true }).click()
  await page.getByLabel('The quote, word for word').fill('x')
  await page.getByLabel('Link').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.locator('p[role=alert]')).toContainText('Links must start with http')
})

test('full-text search across reaction, source and author; tag and type filters; safe highlighting', async ({ page }) => {
  await login(page)
  // Content that looks like HTML must render as text in search results
  await openCapture(page)
  await page.getByText('Post', { exact: true }).click()
  await page.getByLabel('What the post said').fill(`<img src=x onerror="window.__xss=1"> quokkas ${stamp}`)
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')

  const search = async (q: string) => {
    await page.goto(`/studio/library?q=${encodeURIComponent(q)}`)
    return page.getByTestId('result-count')
  }
  await expect(await search(`zephyrine${stamp}`)).toHaveText(/^1 item/)               // word only in the reaction
  await expect(page.locator('mark').first()).toHaveText(`zephyrine${stamp}`)
  await expect(await search('Marcus Aurelius setbacks')).toHaveText(/^\d+ items?/)
  await expect(page.getByRole('link', { name: /Meditations/ }).first()).toBeVisible()
  await expect(await search('nonexistentwordqq')).toHaveText(/^0 items/)

  await expect(await search(`quokkas ${stamp}`)).toHaveText(/^1 item/)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await expect(page.locator('main img')).toHaveCount(0)

  await page.goto('/studio/library?tag=stoicism')
  await expect(page.getByRole('link', { name: /Meditations/ })).toBeVisible()
  await page.goto('/studio/library?kind=thought&q=Meditations')
  await expect(page.getByTestId('result-count')).toHaveText(/^0 items/)
})

test('Promote to newsletter creates a linked, attributed idea and leaves the capture untouched', async ({ page }) => {
  await login(page)
  await page.goto(quoteUrl)
  const before = await page.getByTestId('timestamps').textContent()
  await page.getByRole('button', { name: 'Promote to newsletter' }).click()
  await expect(page.getByRole('status')).toContainText('In your newsletter ideas')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Promote to newsletter' })).toHaveCount(0)
  await expect(page.getByTestId('timestamps')).toHaveText(before!)
  await expect(page.getByTestId('original')).toHaveText(QUOTE)

  await page.goto('/studio')
  const idea = page.locator('[data-stage="seed"] li', { hasText: REACTION })
  await expect(idea).toContainText(`My reaction: ${REACTION}`)
  await expect(idea).toContainText(`Source text: “${QUOTE}” (Marcus Aurelius, “Meditations”, Book 5.20)`)
  await expect(idea.getByRole('link', { name: 'from library' })).toHaveAttribute('href', new URL(quoteUrl).pathname)
})

test('editing a summary records it as Col’s text; export includes everything; delete removes it', async ({ page }) => {
  await login(page)
  await page.goto(quoteUrl)
  await page.getByText('Edit', { exact: true }).click()
  await page.getByLabel('Summary').fill('Obstacles become the path.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Written by you')).toBeVisible()

  const exp = await page.request.get('/studio/export')
  expect(exp.headers()['content-disposition']).toContain('the-dash-export-')
  const data = await exp.json()
  expect(data.format).toBe('the-dash-export/v1')
  const cap = data.captures.find((c: { content: string }) => c.content === QUOTE)
  expect(cap).toMatchObject({ attribution: 'Marcus Aurelius', reaction: REACTION, summary: 'Obstacles become the path.', summary_origin: 'human' })
  expect(cap.tags).toEqual(['setbacks', 'stoicism'])
  const att = data.attachments.find((a: { capture_id: string }) => a.capture_id === cap.id)
  expect(Buffer.from(att.data_base64, 'base64').toString()).toBe(`margin notes ${stamp}`)
  expect(data.newsletter.entries.some((e: { capture_id: string }) => e.capture_id === cap.id)).toBe(true)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/studio\/library$/)
  await page.goto(`/studio/library?q=zephyrine${stamp}`)
  await expect(page.getByTestId('result-count')).toHaveText(/^0 items/)
  expect((await page.request.get(quoteUrl)).status()).toBe(404)
  // The newsletter idea promoted from it is kept
  await page.goto('/studio')
  await expect(page.locator('li', { hasText: REACTION })).toBeVisible()
})

test('capture works on a phone without horizontal scrolling @mobile', async ({ page }) => {
  await login(page)
  await openCapture(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.getByLabel('In your own words').fill(`Captured on the bus ${stamp}`)
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
})
