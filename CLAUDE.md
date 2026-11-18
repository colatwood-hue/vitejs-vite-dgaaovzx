# The Dash

A personal newsletter studio for Col: capture raw observations, develop them into letters, approve, publish to a public archive, and (from milestone 2) email subscribers.

**Editorial rules live in `.claude/skills/dash-editorial-system/SKILL.md`. Load it for any writing, drafting or workflow work.** The short version: never invent experiences, preserve Col's voice, challenge weak claims, no clichés, and nothing publishes without Col's approval.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`), `@tailwindcss/typography` |
| Database | Postgres (Supabase in production), accessed **only from the server** with `postgres` (porsager) |
| Editor | Tiptap v3 (StarterKit); content stored as JSON and rendered to HTML on the server |
| Email | React Email templates (`src/emails/`); `src/lib/mailer.ts` sends via Resend's REST API, or a JSONL log file in dev/tests |
| Validation | zod v4 at every server boundary |
| Tests | Playwright e2e against a real Postgres test database |
| Deploy | Vercel |

Next.js 16 notes: `middleware.ts` is now **`src/proxy.ts`**; `params` is a Promise (use `PageProps<'/route'>` / `RouteContext<'/route'>`); `typedRoutes` is on. Bundled docs are in `node_modules/next/dist/docs/`, so check there before relying on memory.

## Layout

```
src/app/                 routes (public: /, /issues/[slug]; studio: /studio/**; /login)
src/app/studio/actions.ts all studio mutations (server actions)
src/lib/                 db, auth/session, issues queries, render (Tiptap→HTML), email, validation, site config
src/emails/              React Email templates
src/proxy.ts             fast redirect for /studio (NOT the security boundary)
supabase/migrations/     SQL migrations, applied by scripts/migrate.mjs
framework/               the editorial playbook (rendered at /studio/playbook)
e2e/                     Playwright tests
docs/PLAN.md             milestones and status
```

## Commands

```bash
npm run dev            # local dev (needs .env.local, see .env.example)
npm run db:migrate     # apply supabase/migrations to $DATABASE_URL
npm run lint && npm run typecheck && npm run build
npm run test:e2e       # resets the *_test database, builds, runs Playwright
```

Local Postgres: `postgres://dash:dash@localhost:5432/dash` (dev) and `.../dash_test` (tests). In a fresh cloud container: `pg_ctlcluster 16 main start`.

## Security requirements

- **Every** studio page and server action calls `requireStudio()` first. The proxy alone is not enough; route handlers verify the session themselves.
- All DB access is server-side via tagged templates (parameterised). Never string-build SQL. Never import `src/lib/db.ts` into client code (it's `server-only`).
- RLS is **enabled with no policies** on every table, so Supabase's anon/authenticated keys can't touch data. Every new table must do the same in its migration.
- Validate all input with zod. Links must be `http(s)`. Editor HTML is generated server-side from schema-constrained JSON, and hrefs are filtered again.
- Secrets live only in env vars (`.env.local` locally, Vercel/Supabase dashboards in production). Never commit them, log them, or send them to the client. Only `NEXT_PUBLIC_*` reaches the browser.
- Subscriber data: store the minimum; double opt-in; consent timestamp + source; one-click unsubscribe (RFC 8058 `List-Unsubscribe` headers); confirm tokens hashed at rest; unsubscribe tokens are HMAC-signed with `TOKEN_SECRET`.
- Never write code that moves a subscriber out of `unsubscribed`/`bounced`/`complained`, except the subscriber's own new double opt-in (and never for bounced/complained).
- Sending invariants (enforced server-side in `src/lib/sending.ts`): issue published, a test sent after the latest approval, the typed recipient count matches, at most one `sends` row per issue. Claude never triggers a real send.
- Public endpoints are rate-limited (`src/lib/rate-limit.ts`) and must not reveal whether an email is subscribed.

## Testing rules

- New user-facing behaviour gets a Playwright test in `e2e/`. Tests run against a real database, so don't mock the DB.
- Use accessible locators (`getByRole`, `getByLabel`). App error messages are `p[role=alert]`, because Next adds its own `role=alert` route announcer.
- Don't claim something works until `npm run lint`, `npm run typecheck` and `npm run test:e2e` pass. Run them before every commit.
- Email sending is tested with the log transport (`EMAIL_TRANSPORT=log`), never against real inboxes. Tests read `.e2e-email-log.jsonl` via `emails()` in `e2e/helpers.ts`.

## Conventions

- Server Components by default; `'use client'` only for interactivity (editor, forms).
- Mutations are server actions in `actions.ts`, returning `{ error }` / `{ ok }` for forms.
- Design: warm editorial palette, Newsreader (serif) for reading surfaces, Inter for UI. Use the theme tokens (`ink`, `paper`, `sheet`, `accent`, `muted`, `line`, `wash`), not raw colours. Must work at 390px wide and in dark mode.
- Keep dependencies lean. Prefer an official, well-maintained package; review third-party code before adding it.
