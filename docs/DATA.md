# Your data: privacy, storage, AI, backup

## What is stored, and where
Everything lives in one Postgres database (Supabase in production):

| Data | Table(s) | Who can see it |
|---|---|---|
| Library captures (text, provenance, your reactions, summaries, transcripts) | `captures`, `tags`, `capture_tags` | Only you, signed in |
| Voice notes, photos, PDFs (≤ 4 MB per capture) | `attachments` (bytea) | Only you, signed in; served with `no-store`, `nosniff` and a sandbox CSP |
| Newsletter ideas, letters | `entries`, `issues`, `issue_sources` | Only you, until you **approve and publish** a letter |
| Readers | `subscribers`, `sends`, `deliveries` | Only you |

Every table has Row Level Security enabled **with no policies**, so Supabase's public API keys can read nothing. All access goes through the signed-in Next.js server.

**Nothing in the library is ever published automatically.** "Promote to newsletter" copies a *reference* into your private ideas inbox; a letter only becomes public after you approve and publish it, and only goes to readers after a test send and a typed confirmation.

## Export
Studio → **Export** downloads one JSON file (`the-dash-export/v1`) containing every capture with tags and provenance, all attachments (base64), and all newsletter data. It's an open format, readable by any tool. The file includes readers' email addresses, so store it securely.

## Deletion
- Deleting a capture permanently removes it, its tags links and its attachments. A newsletter idea promoted from it is kept, with the link cleared.
- Unsubscribed, bounced and complained readers are retained as suppression records so they are never emailed again. Delete them directly in the database if someone asks for erasure.
- Database backups (below) may retain deleted data until they expire.

## Backups
- **Supabase:** daily backups are included on paid plans (Point-in-Time Recovery is an add-on). On the free plan, take your own.
- **Your own:** download an **Export** regularly, and/or run `pg_dump "$DATABASE_URL" > dash-$(date +%F).sql` and keep the file encrypted (e.g. in a password manager vault or an encrypted disk).
- Test a restore once: `psql "$NEW_DATABASE_URL" < dash-YYYY-MM-DD.sql`.

## AI providers (phase 2 and later)
No AI features are active yet. When they are:
- Only the specific captures you select (or that retrieval selects for a question you ask) are sent to the model provider (Anthropic's API), over TLS, from the server. Nothing is sent in the background.
- Under Anthropic's commercial API terms, inputs and outputs are not used to train models by default and are retained only for a limited period for abuse monitoring. Check the current terms before enabling.
- AI-written text is stored with `origin = 'ai'` and labelled in the UI until you edit it (which makes it yours). AI never overwrites your words, and suggestions require your acceptance.
- The API key lives only in server environment variables.

## Copyright and other people's privacy
- Quotes and passages are kept for your private study, with attribution. When something moves into a public letter, quote briefly, attribute, and link. Don't reproduce long passages.
- Conversations and other people's posts may include personal details. Keep them private. Before publishing anything drawn from them, remove identifying details or ask the person.
