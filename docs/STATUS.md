# Status, validation and next priorities

_Last validated: 2026-11-25_

## Validation results

| Check | Result |
|---|---|
| `npm run lint` (ESLint + Next + React hooks rules) | clean |
| `npm run typecheck` | clean |
| `npm test`: 66 tests in 8 suites (auth & two-factor, consent, sending, publishing & rhythm, AI orchestration, storage, search) | 66/66 pass |
| `npm run build` | succeeds |
| `node e2e/acceptance.mjs`: 22-step browser walkthrough (desktop + iPhone), including two-factor sign-in and search | 22/22 pass |
| `npm audit --omit=dev` (production dependencies) | 0 vulnerabilities. Dev-only findings come from test tools (s3rver, vitest) and don't ship. |

Added this round: TOTP against the RFC 6238 test vectors, code replay and lockout, single-use recovery codes, encrypted secrets; presigned direct uploads, HEAD-verified registration and reads against a local S3-compatible server (s3rver; note that it does not check SigV4 signatures); background transcription success and failure paths; stemmed, phrase and partial-word search, injection-safe queries and snippet escaping; related-idea suggestions; writing-rhythm calculations.

Automated tests cover: password hashing, sessions, rate limiting; double opt-in, consent records, unsubscribe and suppression, preferences, bounce/complaint handling, manual and CSV import evidence rules, implied-consent expiry, segmentation; approval binding and revocation, placeholder guard, issue numbering, archive visibility, revisions and restore, HTML sanitisation; test sends, the broadcast safety gates (approval, test sent, CASL fields, `ALLOW_BROADCASTS`, typed confirmation), exactly-once delivery under concurrent workers, retries vs permanent failures, late suppression, cancellation, webhook signature verification; and the AI rules (sensitive notes excluded, Col's words labelled, ≤3 questions and ≤3 rounds, drafts never auto-approve, critique reads manual edits, final proposal applied only on request).

## Acceptance workflow (brief §18)

| # | Step | How verified |
|---|---|---|
| 1 | Open the studio on a phone | e2e step 19 (iPhone viewport) |
| 2 | Record a 3-minute voice note | In-browser recorder (MediaRecorder). **Manual check needed on a real phone**: headless browsers have no microphone. Upload path tested in e2e step 4 |
| 3 | Receive a transcription | **Manual** once a transcription key is set: OpenAI/Deepgram calls are implemented but were not run here (no keys). The no-provider path is tested |
| 4 | Convert it into an idea | e2e step 5 |
| 5 | Answer AI interview questions | Orchestration unit-tested with the model mocked. **Manual** with a real `ANTHROPIC_API_KEY` |
| 6 | Generate a first draft | As above |
| 7 | Edit the draft manually | e2e step 7 (autosave) |
| 8 | Preview as email | e2e step 8 (desktop + mobile email, web) |
| 9 | Send a test email | e2e step 9 (simulated provider). **Manual** with Resend |
| 10 | Approve the final version | e2e step 11 (including placeholder refusal) |
| 11 | Send to a consented list | e2e step 13 (simulated) + unit tests with a fake real provider |
| 12 | Publish to the public archive | e2e steps 14, 17 (canonical URL, RSS) |
| 13 | Review delivery results & feedback | e2e step 15 |
| 14 | Generate a LinkedIn post | Manual derivative in e2e step 16; AI generation unit-tested with mock |

**Manual procedure for the integrations** (do this once after adding keys): Settings → Test AI connection → Send connection test email; on your phone, record a ~3-minute voice note, confirm the transcript; run concept 001 through Understand → Interview (answer once by voice) → Angles → Draft → Critique → Finalize → Apply; send yourself a test; approve; add yourself as a subscriber; send; confirm delivery events appear in the send log after the webhook fires; click Unsubscribe in the received email and confirm you're suppressed.

## Feature status

### Working
- Public site: home, archive (year + theme filter), issue pages (canonical, Open Graph, JSON-LD, prev/next, share, reply), About, Subscribe, double opt-in confirm, preferences, unsubscribe + RFC 8058 one-click, privacy & contact, RSS, sitemap, robots
- Auth: single owner, setup token + CLI, sessions, rate-limited login
- Thought Inbox: all capture types, in-browser recording, audio upload, originals preserved, transcription (provider-pluggable), editable AI analysis, tags, pillars, privacy, status, linking
- Ideas: full fields, 7-stage pipeline board + list, search/filter by pillar/stage/date, connect, merge, archive/reopen, seeded 12 concepts
- AI editorial partner: all six stages, voice answers, direction notes, versioned outputs, voice guidelines
- Editor: Markdown, toolbar, autosave, version history with diff/restore, numbering, slugs, pillars/themes, images, web + email previews (desktop/mobile), export MD/HTML/email HTML, publishing checklist
- Delivery: provider abstraction, Resend adapter, simulated provider, test sends, approval binding, typed confirmation, scheduling + cancel, cron dispatcher, idempotency, retries, send log, webhooks (bounce/complaint suppression, delivery/click/open events)
- Subscribers: consent records, manual add + CSV import with evidence, export, tags/segments, test recipients, suppression list
- Analytics & feedback log; repurposing (AI + manual)
- Onboarding checklist with honest integration states
- Object storage (S3/R2/B2/MinIO) with browser-direct presigned uploads; database storage remains the default
- Background transcription with live status on the thought page
- Full-text search across notes, transcripts, ideas and issues (stemming, phrases, exclusions, highlighted snippets), plus "might belong with" idea suggestions on each thought
- Two-factor sign-in (authenticator app + recovery codes), password change, sign out other devices
- Writing rhythm: chosen cadence, next-due date, consistency, suggested next step

### Partially implemented / unverified here
- **Resend, Anthropic, OpenAI and Deepgram live calls**: implemented against their documented APIs but never run against the real services in this environment (no credentials, and the build sandbox couldn't reach their docs). Unit tests exercise everything around them with fakes.
- **Kit**: not implemented (see SETUP.md §4 for why); the provider interface is ready for an adapter.
- **Semantic search**: full-text (lexical) search with stemming. It doesn't understand synonyms ("fear" won't find "afraid"). Embedding-based search needs an embeddings provider; Anthropic doesn't offer one.
- **Object storage**: tested against a local S3-compatible server only; run the real-bucket check below once configured.
- **Inbound replies**: not built. Resend's receiving API couldn't be verified from this environment (its docs host is blocked), and I didn't want to guess at webhook payloads.
- **Rich text**: Markdown editor with live preview, not WYSIWYG.

### Planned / next priorities
1. Run the manual integration procedure above with real keys (Resend, Anthropic, transcription, and a real R2/S3 bucket: record a long voice note, confirm it plays back and transcribes).
2. Inbound reply capture into the feedback log (Resend inbound or a forwarding address), once its API can be checked.
3. Semantic search via an embeddings provider (e.g. Voyage AI) + pgvector, if lexical search proves too literal.
4. Batch sending API for lists in the hundreds (currently one request per recipient, resumable via cron, fine for dozens).
5. Passkeys as an alternative second factor.

## Known limitations
- Two-factor secrets are encrypted with a key derived from `AUTH_SECRET`; rotating it disables existing two-factor setups (recovery codes still work).
- Background transcription runs inside the request's serverless function after the response (`after()`), bounded by the route's 300-second limit. A recording that takes longer to transcribe will show "seems stuck" with a retry button.
- Single studio user (by design for v1).
- Test sends to ad-hoc addresses carry generic manage links (not a real subscription).
- Signup confirmation emails are sent synchronously during the signup request.
- Voice answers inside the AI interview are still transcribed synchronously (the answer needs the text immediately).
- Page-view counts are deliberately coarse (path + time, no visitor identity).
- The privacy policy is a template, not legal advice.
