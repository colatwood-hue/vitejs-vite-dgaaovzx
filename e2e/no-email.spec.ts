import { expect, test } from '@playwright/test'
import { NO_EMAIL_PORT } from '../playwright.config'
import { login } from './helpers'

// A fresh deploy without Resend: the site works, signup is hidden, nothing pretends to send.
test.use({ baseURL: `http://localhost:${NO_EMAIL_PORT}` })

test('without email settings, the site and studio work and public signup is hidden', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Subscriptions open soon')).toBeVisible()
  await expect(page.getByLabel('Email address')).toHaveCount(0)

  await login(page)
  await page.goto('/studio/capture')
  await page.getByLabel('In your own words').fill('Works before email is set up')
  await page.getByRole('button', { name: 'Save to library' }).click()
  await expect(page.getByRole('status')).toContainText('Saved')
})
