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

## Milestone 2: Subscribers and sending (needs Supabase + Resend)
- Move to the hosted Supabase project; replace password auth with Supabase Auth magic link restricted to Col's email
- `subscribers` table: double opt-in, consent timestamp/source, hashed tokens, status
- Public subscribe form (rate-limited) → confirmation email → confirmed
- One-click unsubscribe page + `List-Unsubscribe` / `List-Unsubscribe-Post` headers
- Send flow: test send to Col → confirm → batched send via Resend; `sends` + per-recipient `deliveries` tables; idempotent retries
- Resend webhooks (signature verified) for delivered / bounced / complained → auto-suppress
- CSV import of an existing contact list, with a consent checkbox
- **Tests:** subscribe/confirm/unsubscribe via log transport; send blocked unless published + confirmed

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
