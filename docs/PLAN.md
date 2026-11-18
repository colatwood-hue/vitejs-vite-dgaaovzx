# The Dash: implementation plan

Each milestone is independently shippable and has its own Playwright coverage.

## ✅ Milestone 1: Write and publish (done)
- Next.js 16 + Tailwind v4 + Postgres schema with RLS on (no policies)
- Studio sign-in (password + signed, expiring HTTP-only cookie)
- Capture inbox with Seed → Sprouting → Ready → In a letter stages; entries tagged by kind and pillar
- Start a letter from selected entries; sources shown in the editor (provenance)
- Tiptap editor for the big idea, structured fields for the rest, autosave
- React Email template; live desktop/phone preview; HTML and plain-text export
- Approval gate: approve exact version → publish; any edit un-approves; DB constraint backs it up
- Public home + archive + issue pages
- **Tests:** auth redirect, wrong password, forged cookie, unauthenticated preview, full capture→publish flow, approval reset on edit, unsafe link rejection, mobile overflow

## ✅ Milestone 2: Subscribers and sending (done, except the auth swap)
- `subscribers` with consent source and timestamp, statuses pending/active/unsubscribed/bounced/complained; RLS on
- Public double opt-in: subscribe form (honeypot, per-IP and per-email rate limits, identical response whether or not the address exists) → confirmation email (hashed single-use token, 48h) → confirm **button** (link scanners can't confirm)
- Unsubscribe: signed stateless token; `/unsubscribe` page + RFC 8058 one-click `POST /api/unsubscribe`; `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every issue email
- Studio Readers page: counts, list, owner-add/CSV paste with a consent attestation; existing rows are never modified, so unsubscribes/bounces can't be undone
- Send flow: test to `OWNER_EMAIL` after the latest approval → publish → type the recipient count → one send per issue (unique constraint) → batches of 100 via Resend with idempotency keys → per-recipient `deliveries`; resumable and retryable
- Resend webhooks: Svix signature + 5-minute timestamp window, idempotent by event id; bounces and complaints suppress the reader
- Transport: `log` (file) for dev/tests, `resend` (REST API) for production
- **Tests:** double opt-in, scanner-safe confirm, token reuse, no enumeration, honeypot, rate limit, consent attestation, no resubscribe, stale-test guard, typed confirmation, one-send-only, per-reader unsubscribe tokens + headers, one-click and page unsubscribe, forged tokens, webhook signature/expiry/replay/bounce

### Still to do in milestone 2 (needs your accounts)
- **Verify the Resend transport for real.** The REST call is written to Resend's documented API but has only been exercised through the log transport. First real run: send a test to yourself.
- **Supabase Auth** magic link, restricted to Col's email, replacing the studio password.
- Scheduled cleanup of unconfirmed signups older than 30 days, and of old `rate_limits` rows.
- Sends run inside the server action: fine for hundreds of readers. Beyond a few thousand, move processing to a background job (Vercel Cron or a queue).

## Milestone 3: Editorial assistant (needs Anthropic API key)
- Claude-powered Interpret / Challenge / Interview / Draft / Edit, following `dash-editorial-system`
- Interview runs one question at a time; answers saved as new entries
- Drafts mark `[NEED: …]` gaps; suggestions are shown as diffs and accepted per change, never auto-applied
- Voice-note capture (upload + transcription)
- **Tests:** model calls stubbed at the HTTP boundary; verify no field changes without acceptance

## Milestone 4: Learn and grow
- Issue log: opens, clicks, replies, unsubscribes per issue; "one lesson" per issue
- Reply tracking (inbound email or manual)
- shadcn/ui for richer studio components where needed (dialogs, command palette)
- Public archive SEO, RSS, social cards
