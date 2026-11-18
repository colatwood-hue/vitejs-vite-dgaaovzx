import { expect, type Page } from '@playwright/test'
import { TEST_PASSWORD } from '../playwright.config'

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Studio password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await expect(page).toHaveURL(/\/studio$/)
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved', { timeout: 10_000 })
}
