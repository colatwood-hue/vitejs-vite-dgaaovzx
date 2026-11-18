'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getIssue, slugify, type EntryStage } from '@/lib/issues'
import { docToText } from '@/lib/render'
import { requireStudio } from '@/lib/session'
import { entryInput, issueInput, uuid, type IssueInput } from '@/lib/validation'
import { addConsented, unsubscribe } from '@/lib/subscribers'
import { retryFailed, sendTestEmail, startSend } from '@/lib/sending'

export type ActionState = { error?: string; ok?: boolean } | undefined

export async function createEntry(_: ActionState, form: FormData): Promise<ActionState> {
  await requireStudio()
  const parsed = entryInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid entry' }
  const { body, kind, pillar } = parsed.data
  await sql`insert into entries (body, kind, pillar) values (${body}, ${kind}, ${pillar})`
  revalidatePath('/studio')
  return { ok: true }
}

export async function setEntryStage(id: string, stage: EntryStage) {
  await requireStudio()
  const s = z.enum(['seed', 'sprouting', 'ready', 'used']).parse(stage)
  await sql`update entries set stage = ${s} where id = ${uuid.parse(id)}`
  revalidatePath('/studio')
}

export async function deleteEntry(id: string) {
  await requireStudio()
  await sql`delete from entries where id = ${uuid.parse(id)}`
  revalidatePath('/studio')
}

/** Start a draft from one or more captured entries. The entries become the issue's sources. */
export async function createIssue(entryIds: string[]) {
  await requireStudio()
  const ids = z.array(uuid).max(20).parse(entryIds)
  const id = await sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(number), 0) + 1 as next from issues`
    const [row] = await tx<{ id: string }[]>`
      insert into issues (number, slug) values (${next}, ${`issue-${next}`}) returning id`
    if (ids.length) {
      await tx`insert into issue_sources ${tx(ids.map((entry_id) => ({ issue_id: row.id, entry_id })))}`
      await tx`update entries set stage = 'used' where id in ${tx(ids)}`
    }
    return row.id
  })
  revalidatePath('/studio')
  redirect(`/studio/issues/${id}`)
}

/** Saving any change to an approved issue sends it back to draft: approval covers exact content. */
export async function saveIssue(id: string, input: IssueInput): Promise<ActionState> {
  await requireStudio()
  const issueId = uuid.parse(id)
  const parsed = issueInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid issue' }
  const d = parsed.data
  const links = d.links.filter((l) => l.title || l.url || l.why)
  const rows = await sql`
    update issues set
      subject = ${d.subject}, preview = ${d.preview}, title = ${d.title}, opening = ${d.opening},
      body = ${sql.json(d.body as never)}, learning = ${d.learning}, links = ${sql.json(links)},
      question = ${d.question}, status = 'draft', approved_at = null
    where id = ${issueId} and status <> 'published'
    returning id`
  if (!rows.length) return { error: 'Published issues are locked.' }
  revalidatePath(`/studio/issues/${issueId}`)
  return { ok: true }
}

export async function approveIssue(id: string): Promise<ActionState> {
  await requireStudio()
  const issue = await getIssue(uuid.parse(id))
  if (!issue) return { error: 'Issue not found' }
  const missing = [
    !issue.subject.trim() && 'a subject line',
    !issue.preview.trim() && 'preview text',
    !issue.title.trim() && 'a headline',
    !docToText(issue.body).trim() && 'the big idea',
  ].filter(Boolean)
  if (missing.length) return { error: `Add ${missing.join(', ')} before approving.` }
  await sql`update issues set status = 'approved', approved_at = now() where id = ${issue.id} and status = 'draft'`
  revalidatePath(`/studio/issues/${issue.id}`)
  return { ok: true }
}

export async function unapproveIssue(id: string) {
  await requireStudio()
  await sql`update issues set status = 'draft', approved_at = null where id = ${uuid.parse(id)} and status = 'approved'`
  revalidatePath(`/studio/issues/${id}`)
}

export async function publishIssue(id: string): Promise<ActionState> {
  await requireStudio()
  const issue = await getIssue(uuid.parse(id))
  if (!issue) return { error: 'Issue not found' }
  if (issue.status !== 'approved') return { error: 'Approve the issue before publishing.' }
  const slug = `${issue.number}-${slugify(issue.title)}`
  await sql`
    update issues set status = 'published', published_at = now(), slug = ${slug}
    where id = ${issue.id} and status = 'approved' and approved_at is not null`
  revalidatePath('/')
  revalidatePath(`/studio/issues/${issue.id}`)
  return { ok: true }
}

export async function deleteIssue(id: string) {
  await requireStudio()
  await sql`delete from issues where id = ${uuid.parse(id)} and status <> 'published'`
  revalidatePath('/studio')
  redirect('/studio')
}

// ── Milestone 2: subscribers and sending ────────────────────────────────────

const personSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  name: z.string().trim().max(100),
})

/** Accepts `email`, `email,name`, `name,email` or `Name <email>` per line. */
function parsePeople(text: string) {
  const people: { email: string; name: string }[] = []
  const invalid: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^email\b/i.test(line)) continue
    const angle = line.match(/^(.*)<([^>]+)>$/)
    const parts = angle ? [angle[2], angle[1]] : line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))
    const emailIdx = parts.findIndex((p) => p.includes('@'))
    const parsed = personSchema.safeParse({ email: parts[emailIdx] ?? '', name: (parts.find((_, i) => i !== emailIdx) ?? '').trim() })
    if (parsed.success) people.push(parsed.data)
    else invalid.push(line)
  }
  return { people, invalid }
}

export type AddState = { error?: string; ok?: boolean; added?: number; skipped?: number; invalid?: string[] } | undefined

export async function addSubscribers(_: AddState, form: FormData): Promise<AddState> {
  await requireStudio()
  if (form.get('consent') !== 'on') return { error: 'Only add people who have told you they want to receive it.' }
  const { people, invalid } = parsePeople(String(form.get('people') ?? ''))
  if (people.length === 0) return { error: invalid.length ? `No valid addresses found (${invalid.length} invalid).` : 'Paste at least one email address.' }
  if (people.length > 2000) return { error: 'Import at most 2,000 at a time.' }
  const source = people.length === 1 ? 'personal_invite' : 'import'
  const added = await addConsented(people, source)
  revalidatePath('/studio/subscribers')
  return { ok: true, added, skipped: people.length - added, invalid }
}

export async function removeSubscriber(id: string) {
  await requireStudio()
  await unsubscribe(uuid.parse(id))
  revalidatePath('/studio/subscribers')
}

export async function sendTest(id: string): Promise<ActionState & { to?: string }> {
  await requireStudio()
  const res = await sendTestEmail(uuid.parse(id))
  revalidatePath(`/studio/issues/${id}`)
  return res
}

export async function sendIssue(id: string, typedCount: number): Promise<ActionState & { failed?: number }> {
  await requireStudio()
  const res = await startSend(uuid.parse(id), z.number().int().parse(typedCount))
  revalidatePath(`/studio/issues/${id}`)
  return res
}

export async function retrySend(issueId: string, sendId: string): Promise<ActionState & { failed?: number }> {
  await requireStudio()
  const res = await retryFailed(uuid.parse(sendId))
  revalidatePath(`/studio/issues/${issueId}`)
  return res
}
