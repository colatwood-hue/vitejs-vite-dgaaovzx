import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
export const NO_EMAIL_PORT = 3101
export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://dash:dash@localhost:5432/dash_test'
export const TEST_PASSWORD = 'e2e-password'
export const EMAIL_LOG = '.e2e-email-log.jsonl'
export const OWNER_EMAIL = 'col@example.com'
export const WEBHOOK_SECRET = 'whsec_' + Buffer.from('e2e-webhook-secret-e2e-webhook-secret').toString('base64')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        // Fake microphone so voice-note recording can be tested.
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
      },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `node scripts/reset-test-db.mjs && rm -f ${EMAIL_LOG} && npx next build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: TEST_DB,
        STUDIO_PASSWORD: TEST_PASSWORD,
        SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0000',
        NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
        TOKEN_SECRET: 'e2e-token-secret-e2e-token-secret-000000',
        EMAIL_TRANSPORT: 'log',
        EMAIL_LOG_FILE: EMAIL_LOG,
        EMAIL_FROM: 'The Dash <letters@example.com>',
        OWNER_EMAIL,
        RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
      },
    },
    {
      // Same build, but with no email settings at all: how a fresh production deploy behaves.
      command: `npx next start -p ${NO_EMAIL_PORT}`,
      url: `http://localhost:${NO_EMAIL_PORT}/login`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: TEST_DB,
        STUDIO_PASSWORD: TEST_PASSWORD,
        SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0000',
        TOKEN_SECRET: 'e2e-token-secret-e2e-token-secret-000000',
        NEXT_PUBLIC_SITE_URL: `http://localhost:${NO_EMAIL_PORT}`,
        // Explicitly blank, so values in a developer's .env.local can't switch email back on.
        EMAIL_TRANSPORT: '',
        RESEND_API_KEY: '',
      },
    },
  ],
})
