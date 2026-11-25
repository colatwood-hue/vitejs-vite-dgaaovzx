# The Dash

**A letter about life, becoming, and everything in between.** A personal newsletter by Col Atwood, part of *Who Is Col*.

This repository holds both halves of the publication:

- **The public site:** home, archive (by date and theme), issue pages with SEO metadata, About, Subscribe (double opt-in), email preferences, one-click unsubscribe, privacy & contact, and RSS.
- **The private editorial studio** (`/studio`): Thought Inbox (text, voice, audio upload, background transcription), full-text search, Idea Library & pipeline, AI editorial partner, issue editor, publishing, subscribers & consent, analytics & feedback, repurposing, writing rhythm, and settings with two-factor sign-in.

> The software should never become more complicated than writing the newsletter itself.

## Quick start (local)

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL, AUTH_SECRET, SETUP_TOKEN
npm run db:migrate
npm run db:seed               # pillars + the 12 launch concepts (no fake subscribers)
npm run dev                   # http://localhost:3000
```

Open `http://localhost:3000/studio/setup`, enter your `SETUP_TOKEN`, and create the owner account. Email is in **simulated** mode until you configure a provider, so nothing is ever delivered by accident.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Environment variables, local development, deployment (Vercel + Postgres), integration setup (Resend, Anthropic, transcription, cron) |
| [docs/GUIDE.md](docs/GUIDE.md) | Administrator onboarding and the editorial workflow, idea to inbox |
| [docs/STATUS.md](docs/STATUS.md) | What's working, what's partial, what's planned; tests, acceptance results, known limitations |

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · PostgreSQL with Drizzle ORM (incl. full-text search) · Anthropic Claude (`@anthropic-ai/sdk`) · Resend (behind a provider interface) · optional S3-compatible storage · Vitest · Playwright.

```
src/
  app/(site)/          public pages
  app/studio/          studio (auth-guarded); (app)/ holds the signed-in layout
  app/api/             unsubscribe (RFC 8058), webhooks, cron, media, page views
  actions/             server actions: every one calls requireUser() first
  lib/                 domain modules: issues, campaigns, subscribers, auth, ...
  lib/email/           provider interface, Resend + simulated adapters, templates
  lib/ai/              prompts (editorial rules) + stage orchestration
  db/schema.ts         the whole data model, documented
drizzle/               SQL migrations
tests/                 Vitest suites (real Postgres)
e2e/acceptance.mjs     22-step browser walkthrough of the acceptance workflow
```

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | lint + typecheck + tests + build |
| `npm test` | Vitest (needs a `thedash_test` database, or `TEST_DATABASE_URL`) |
| `npm run db:generate` | create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` | apply migrations / seed pillars and concepts |
| `npm run admin:create -- --email you@example.com` | create the owner from a terminal |
| `node e2e/acceptance.mjs` | browser acceptance run against a running server with a fresh DB |
