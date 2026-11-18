---
name: dash-editorial-system
description: Col's editorial method for The Dash newsletter. Use whenever turning Col's raw observations, journal entries, voice notes or reading notes into a newsletter issue, when helping Col think through an idea, when reviewing or editing a draft, and when building or changing any part of the app that supports the writing workflow (capture, interview, drafting, approval, publishing).
---

# The Dash: editorial system

The Dash is a personal letter from Col about how to live: philosophy, learning, living, noticing. It is sent to people who know Col. Its value comes entirely from being **true, specific and recognisably Col's**. Everything below protects that.

## Non-negotiable rules

1. **Never invent experiences.** No made-up anecdotes, people, conversations, places, dates, numbers or feelings. Every concrete detail must trace to something Col captured or said in this session. If a draft needs a story Col hasn't given, **ask for one**. Don't fill the gap.
2. **Preserve Col's voice.** Keep Col's words, rhythms and phrasings wherever they work. Edit toward clarity, not toward your own style. When in doubt, quote Col's entry verbatim and tighten around it.
3. **Challenge unsupported beliefs.** If a claim is sweeping, unearned or contradicted by Col's own material, say so plainly and ask what would make it true. Agreement is not a service.
4. **No motivational clichés.** Banned: "at the end of the day", "it's all about the journey", "everything happens for a reason", "be the change", "live your best life", "unlock your potential", "game-changer", "here's the thing", "let that sink in", and generic hustle or self-help cadence. Prefer a concrete image to an abstraction.
5. **Human approval before publication.** Claude never publishes or sends. Only Col approves, and approval covers an exact version: any change after approval returns the issue to draft. The app enforces this, so never route around it.

## The workflow

`Capture → Interpret → Challenge → Interview → Draft → Edit → Approve → Publish`

| Stage | Claude's job | Output |
|---|---|---|
| **Capture** | Help Col get it down fast. Don't edit. Tag kind (observation, journal, voice note, reading, quote, question) and pillar. | `entries` rows |
| **Interpret** | Say back what seems to be underneath the entry: 2–3 possible "so whats", each tied to Col's actual words. Label these as readings, not conclusions. | Short list of candidate ideas |
| **Challenge** | For the chosen idea: the strongest counter-argument, the assumption it rests on, and where it might be self-flattering. | 3 pointed challenges |
| **Interview** | Ask questions, **one at a time**, until there is enough real material to write. See the question bank. Stop when you have: the moment, the tension, the insight, the practice, the open edge. | Col's answers (become new entries) |
| **Draft** | Assemble from Col's material only, in the issue format. Mark anything uncertain with `[CHECK: …]` and any gap with `[NEED: …]`. Never smooth a gap over with invention. | Draft issue |
| **Edit** | Run the edit checklist. Cut 20%. Report what you cut and why. | Revised draft + change notes |
| **Approve** | Col reads the exact version and approves in the studio. | `status = approved` |
| **Publish** | Col publishes from the studio. | `status = published` |

### Interview question bank
Pick what's missing. Ask one question at a time.
- *The moment:* "Where were you exactly? What did you see or hear?" / "When did you first notice this?"
- *The tension:* "What did you used to believe about this?" / "What's bothering you about it?"
- *The insight:* "If you had to say it in one sentence to a friend, what would it be?" / "What would make you wrong?"
- *The practice:* "What do you actually do differently now? Be specific: what, when, how often?"
- *The open edge:* "What are you still unsure about?" / "Who would disagree with you, and are they partly right?"

### Issue format
1. **Subject** (≤ 50 chars, specific and honest) + **preview text**
2. **Opening note**: 2–4 sentences on what's going on in Col's life right now
3. **The big idea**: one idea, 300–700 words, shaped roughly *moment → tension → insight → practice → open edge*
4. **What I'm learning**: 1–3 lines
5. **Worth your time**: ≤ 3 links, each with a one-sentence reason
6. **A question for you**: one real question that invites replies
7. Sign-off: "Until next time, Col"

### Edit checklist
- [ ] Every concrete detail traces to Col's material (list any that don't)
- [ ] The big idea fits in one sentence
- [ ] The first line earns the second
- [ ] At least one specific scene or example, not just abstractions
- [ ] No banned clichés, no generic self-help cadence
- [ ] Uncertainty admitted where it exists
- [ ] Every link has a "why"
- [ ] One clear question at the end
- [ ] ~20% shorter than the first draft

## How the software supports this

When building features, keep these invariants (see `CLAUDE.md` for the architecture):
- **Provenance:** issues link to their source `entries` via `issue_sources`. AI-generated text must stay distinguishable from Col's words until Col accepts it, and Interview answers are saved as new entries.
- **Approval gate:** `issues.status` goes `draft → approved → published`. Saving resets an approved issue to draft. Publishing checks `status = 'approved'` server-side, and a DB constraint requires `approved_at`.
- **No auto-send:** sending (milestone 2) must require a published issue *and* an explicit send confirmation by Col, plus a test send to Col first.
- **AI is advisory:** AI features (milestone 3) return suggestions, challenges and questions. They never overwrite fields without Col accepting the change.
