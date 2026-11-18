# The Dash

Col's newsletter studio: capture raw observations, develop them into letters, approve, and publish. Built with Next.js 16, Tailwind v4, Postgres/Supabase, Tiptap and React Email.

- **Plan and status:** [`docs/PLAN.md`](docs/PLAN.md)
- **Architecture and rules:** [`CLAUDE.md`](CLAUDE.md)
- **Editorial method:** [`.claude/skills/dash-editorial-system/SKILL.md`](.claude/skills/dash-editorial-system/SKILL.md)
- **Writing playbook:** [`framework/PLAYBOOK.md`](framework/PLAYBOOK.md) (also at `/studio/playbook`)

## Run locally

```bash
cp .env.example .env.local      # fill in DATABASE_URL, STUDIO_PASSWORD, SESSION_SECRET
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000, studio at /studio
```

## Checks

```bash
npm run lint && npm run typecheck && npm run build
npm run test:e2e                # needs a Postgres database named *_test
```
