# The Dash: owner's guide

## First run (about 15 minutes)

The dashboard shows a 10-step checklist. Each step links to where it's done and shows whether an integration is **configured**, **unconfigured**, **optional** or **failed**.

1. **Name & tagline:** Settings → Publication & profile. Save once to confirm.
2. **Profile & sender:** From name, From address, reply-to, contact email, and a **mailing address** (CASL requires one in every email; a PO box works).
3. **Email delivery:** see SETUP.md §4. Until then, everything runs in simulated mode with a yellow banner.
4. **AI provider (optional):** `ANTHROPIC_API_KEY`. Everything works without it.
5. **Capture your first thought.**
6. **Develop your first issue:** concept **001** is waiting on the dashboard, ready for an interview.
7. **Preview** it (Web / Email desktop / Email mobile tabs in the editor).
8. **Send a test email** to yourself.
9. **Review signup & privacy:** the privacy policy is a template. Read it, edit it, tick "reviewed".
10. **Publish after explicit approval.**

## The editorial workflow

### 1. Capture (Thought Inbox), under 30 seconds
From any studio page, tap **+ Capture**. Type, pick a type (note, journal, story, question, quote, link…), or **Record voice note**. It's saved privately. Voice notes are kept exactly as recorded and transcribed if a provider is set up.

- **Originals are never modified.** Transcripts and AI analysis are stored separately and are editable.
- Mark anything **Sensitive** and it will never be sent to the AI.
- **Analyse this thought** asks the AI for the central idea, underlying belief, potential contradiction, personal relevance, an angle, related ideas and questions. All of it is editable.

### 2. Shape (Ideas & Pipeline)
**Turn into an idea** from a thought, or add one directly. Stages: Captured → Exploring → Ready to draft → Drafting → Editing → Scheduled → Published. The pipeline board lets you move cards; the list view filters by pillar, stage and date. Ideas can be **connected**, **merged** (notes appended, original archived; reopenable) and **archived**.

### 3. Develop (Editorial partner, on each idea page)
| Stage | What happens |
|---|---|
| Understand | The AI says back what it thinks you're getting at, labelled as its interpretation, plus what's missing |
| Interview | Up to **3 questions** per round, **3 rounds** max. Answer by typing or voice; your answers are kept verbatim |
| Angle | Up to 3 angles (thesis, why a reader cares, opening, your supporting story, strongest counterargument, closing). Edit one, or write your own |
| Draft | 400–700 words, written straight into the issue editor (previous text saved in history). Gaps become `[COL: …]` placeholders. The AI never invents your stories, quotes or facts |
| Critique | Scores authenticity, clarity, originality, specificity, emotional resonance, logic and reader value; quotes generic phrases; gives specific suggestions. It reads the **current editor text**, including your edits |
| Finalize | A proposed final version, 3 subject lines, preview text, excerpts and follow-up ideas. Nothing changes until you click **Apply to editor** |

You can jump between stages at any time and add **direction** ("keep the ending unresolved").

### 4. Write (Issue editor)
Markdown with a small toolbar, autosave (snapshots every 10 minutes), **Save version** (Ctrl/Cmd+S), images, previews, history with line-by-line **Compare** and **Restore**, and export to Markdown, HTML and email HTML. Works fully without AI.

### 5. Publish (right-hand panel)
1. **Send a test** to yourself.
2. **Approve this version.** Approval is refused while any `[COL: …]` placeholder remains, and **any later edit removes approval**.
3. **Publish to website.** It gets an issue number, goes into the archive and RSS, and the idea moves to Published.
4. **Send to subscribers:** now or scheduled. You must type `SEND <count>`. Blocked unless: approved, test sent, CASL sender info complete, provider configured, `ALLOW_BROADCASTS=true` (for real providers), and at least one eligible subscriber. One live broadcast per issue; scheduled ones can be cancelled.

### 6. Learn (Analytics & Feedback)
Subscribers, signups, unsubscribes, page views (first-party, cookie-free), subscribe conversion, publishing consistency, and per-broadcast delivery, bounce, complaint and click counts (from webhooks). Opens are shown as directional only. Nothing is estimated: if a provider isn't connected, the number says *n/a*.

The **Feedback log** is the real signal: log replies, conversations, questions, ideas readers sparked and topics to revisit, and mark people to follow up with (they appear on the dashboard).

### 7. Repurpose
From an issue: LinkedIn reflection, short post, Instagram caption, video script, quote card, discussion prompt, essay outline, future ideas. AI versions are drafts that must stay faithful to the letter. Everything is editable, linked to the issue, and **never posted automatically**.

## Subscribers & consent (CASL)

- Website signups use **express consent** (a required checkbox with a clear statement) and **double opt-in** by default. The confirmation is a button press, so email link scanners can't confirm on someone's behalf. The consent statement, time, IP and user agent are recorded.
- **Adding people by hand or by CSV requires evidence** of how they consented. Knowing someone personally is *not* consent on its own. **Implied consent** (e.g. a recent business relationship) expires after two years and is then excluded automatically.
- Unsubscribes take effect immediately (link, one-click header, preferences, or by you on their behalf) and add the address to the **suppression list**. Bounces and spam complaints suppress automatically. Only manual suppressions can be lifted by you; anyone else must re-subscribe themselves.
- Export everything as CSV at any time.

*This is not legal advice. Have the privacy policy and your consent practices reviewed.*
