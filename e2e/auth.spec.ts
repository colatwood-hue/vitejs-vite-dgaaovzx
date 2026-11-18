import { expect, test } from '@playwright/test'

test('studio redirects signed-out visitors to login', async ({ page }) => {
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/login$/)
})

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Studio password').fill('nope')
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await expect(page.locator('p[role=alert]')).toHaveText('That password is not right.')
  await expect(page).toHaveURL(/\/login$/)
})

test('email preview endpoint refuses unauthenticated requests', async ({ request }) => {
  const res = await request.get('/studio/issues/00000000-0000-0000-0000-000000000000/preview', { maxRedirects: 0 })
  expect([307, 401]).toContain(res.status())
})

test('forged session cookie is rejected', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'dash_session', value: '9999999999.forged', url: baseURL! }])
  await page.goto('/studio')
  await expect(page).toHaveURL(/\/login$/)
})
