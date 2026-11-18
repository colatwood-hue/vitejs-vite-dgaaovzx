'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getIssue, slugify, type EntryStage } from '@/lib/issues'
import { docToText } from '@/lib/render'
import { requireStudio } from '@/lib/session'
import { entryInput, issueInput, uuid, type IssueInput } from '@/lib/validation'

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
