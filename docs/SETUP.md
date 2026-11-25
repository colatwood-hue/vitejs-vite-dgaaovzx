# Setup, deployment and integrations

## 1. Environment variables

All secrets are environment variables, never stored in the database. Copy `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_URL` | yes | Public base URL, no trailing slash (emails, RSS, canonical URLs) |
| `AUTH_SECRET` | yes (prod) | 32+ random characters. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SETUP_TOKEN` | first run | Unlocks `/studio/setup` while no owner exists. Remove after setup. |
| `EMAIL_PROVIDER` | | `console` (default, simulated: never delivers) or `resend` |
| `RESEND_API_KEY` | for email | Resend API key (`re_…`) |
| `RESEND_WEBHOOK_SECRET` | recommended | Resend webhook signing secret (`whsec_…`) for bounces/complaints/clicks |
| `ALLOW_BROADCASTS` | for launch | Must be `true` before any real send to subscribers. Test sends work without it. |
| `ANTHROPIC_API_KEY` | optional | Enables the AI editorial partner |
| `AI_MODEL` | optional | Defaults to `claude-opus-5-5` |
| `TRANSCRIPTION_PROVIDER` | optional | `openai` or `deepgram` |
| `OPENAI_API_KEY` / `OPENAI_TRANSCRIPTION_MODEL` | if openai | Whisper-compatible transcription (`whisper-1` default) |
| `DEEPGRAM_API_KEY` | if deepgram | Deepgram transcription |
| `CRON_SECRET` | for scheduling | Bearer token for `/api/cron/dispatch` |
| `STORAGE_PROVIDER` | optional | `db` (default) or `s3` for voice notes and images |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | if s3 | Any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) |

## 2. Local development

```bash
npm install
cp .env.example .env
createdb thedash && createdb thedash_test     # or use Docker / a hosted DB
npm run db:migrate && npm run db:seed
npm run dev
```

Tests use `thedash_test` (override with `TEST_DATABASE_URL`) and **truncate it**. Never point tests at real data.

Browser acceptance run (against a fresh database):

```bash
./scripts/reset-local-db.sh                  # local only: drops and recreates `thedash`
npm run build && npm start &
node e2e/acceptance.mjs                      # screenshots land in e2e/screenshots/
```

## 3. Deploying (recommended: Vercel + Neon)

1. **Database.** Create a Postgres database (Neon, Supabase, Railway or similar). Use the *pooled* connection string for `DATABASE_URL`.
2. **Migrate and seed** from your machine, pointed at production:
   `DATABASE_URL=… npm run db:migrate && DATABASE_URL=… npm run db:seed`
3. **Vercel.** Import the repo and set the environment variables above (`APP_URL` = your domain). Deploy.
4. **Owner account.** Visit `https://your-domain/studio/setup` with `SETUP_TOKEN`, then delete `SETUP_TOKEN` from Vercel and redeploy.
5. **Cron.** `vercel.json` schedules `/api/cron/dispatch` every 10 minutes and Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. **Vercel Hobby only allows daily crons**: on Hobby, either change the schedule to daily, use "Send now", or call the endpoint from an external scheduler (e.g. cron-job.org) with the bearer header.
6. **Domain.** Point your domain at Vercel and update `APP_URL`.

Other hosts (Railway, Render, Fly, a VPS) work too: `npm run build && npm start`, plus any scheduler hitting the cron URL.

**Storage note:** by default voice notes and issue images are stored in Postgres (`bytea`). That is simplest, and a 3-minute voice note from the in-browser recorder is usually under 1 MB. But **Vercel caps request bodies at about 4.5 MB**, so long uploaded recordings (e.g. WAV files) need object storage. See §6b.

## 4. Email: Resend

**Why Resend rather than Kit (formerly ConvertKit):** The Dash keeps subscribers, consent evidence and suppression in its own database (portable CASL records, one source of truth). Resend is used purely as a delivery pipe: one message per recipient, with personal unsubscribe links, `List-Unsubscribe` one-click headers, idempotency keys and signed webhooks. Kit's API is built around Kit owning the subscriber list and its own broadcasts. Using it would mean two lists drifting apart and Kit-side consent records. Kit could later be added as an adapter (see `src/lib/email/provider.ts`). *Provider capabilities were not re-verified live during this build (the build environment couldn't reach Kit's or Resend's docs). Check the current docs when you connect.*

Steps:
1. Create a Resend account and **verify your sending domain** (add the DNS records it gives you: SPF, DKIM; add a DMARC record too).
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_PROVIDER=resend`.
3. In Studio → Settings, set the From address (on the verified domain), reply-to, contact email and **mailing address**.
4. Studio → Settings → *Send connection test email*.
5. Webhooks: in Resend add endpoint `https://your-domain/api/webhooks/resend` with events `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked`. Copy the signing secret → `RESEND_WEBHOOK_SECRET`.
6. Send yourself test issues. When you're ready for your first real send, set `ALLOW_BROADCASTS=true` and redeploy.

Bounces and complaints automatically suppress the address. Click and open tracking are configured in Resend's domain settings. Opens are directional only.

## 5. AI editorial partner (Anthropic)

Create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. Studio → Settings → *Test AI connection*. Calls use structured outputs, the model's server-side refusal fallback (`fallbacks: "default"`), and a cached system prompt. Subscriber data is never sent to the AI, and thoughts marked **sensitive** are never sent either.

## 6. Transcription

- **OpenAI:** `TRANSCRIPTION_PROVIDER=openai`, `OPENAI_API_KEY`. Optional `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe`.
- **Deepgram:** `TRANSCRIPTION_PROVIDER=deepgram`, `DEEPGRAM_API_KEY`.

Without a provider, recordings are still saved and marked "Not transcribed". Transcribe later from the thought page.

## 6b. Object storage (recommended on Vercel)

With `STORAGE_PROVIDER=s3`, the browser uploads files **directly to your bucket** using 10-minute presigned URLs, so file size isn't limited by the app server (audio up to 100 MB, images up to 10 MB). The server then checks each upload (size and type via `HEAD`) before registering it. Voice notes are played back through 5-minute signed links, so **keep the bucket private**. Issue images are served through `/api/assets/…` and cached permanently, so links in sent emails never expire.

Cloudflare R2 example (no egress fees):
1. R2 → Create bucket `the-dash`. Leave public access **off**.
2. R2 → Manage API tokens → *Object Read & Write* for that bucket. Copy the key ID and secret.
3. Set `STORAGE_PROVIDER=s3`, `S3_BUCKET=the-dash`, `S3_REGION=auto`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, and the two keys.
4. Bucket → Settings → CORS policy:
   ```json
   [{ "AllowedOrigins": ["https://your-domain"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
5. Settings → Integrations should show *File storage: configured*. Record a voice note to confirm.

AWS S3 works the same way (leave `S3_ENDPOINT` empty and set the real region). For MinIO, set `S3_FORCE_PATH_STYLE=true`. Existing database-stored files keep working after you switch; only new uploads go to the bucket.

## 7. Security notes

- **Turn on two-factor sign-in** (Settings → Security). It works with any authenticator app (TOTP). You get 8 single-use recovery codes; store them in your password manager. Secrets are encrypted at rest with a key derived from `AUTH_SECRET`, **so rotating `AUTH_SECRET` disables existing two-factor setups** (sign in with a recovery code, then set it up again). If you lose both phone and recovery codes, clear the `totp_*` columns for your user in the database.

- Single owner account; scrypt password hashing; opaque session tokens stored hashed; httpOnly SameSite=Lax cookies; login rate-limited (Postgres-backed, works on serverless).
- Every server action calls `requireUser()`; studio pages, audio, exports and previews return 404/redirect when signed out.
- Next.js server actions enforce same-origin POSTs (CSRF protection).
- Markdown output is sanitised (no scripts, event handlers or `javascript:` links).
- Subscriber addresses are never rendered publicly; signup and unsubscribe responses don't reveal whether an address exists.
