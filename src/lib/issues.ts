import 'server-only'
import type { JSONContent } from '@tiptap/core'
import { sql } from './db'

export type IssueStatus = 'draft' | 'approved' | 'published'
export interface IssueLink { title: string; url: string; why: string }

export interface Issue {
  id: string
  number: number
  slug: string
  status: IssueStatus
  subject: string
  preview: string
  title: string
  opening: string
  body: JSONContent
  learning: string
  links: IssueLink[]
  question: string
  approved_at: Date | null
  test_sent_at: Date | null
  published_at: Date | null
  created_at: Date
  updated_at: Date
}

export type EntryKind = 'observation' | 'journal' | 'voice_note' | 'quote' | 'question' | 'reading'
export type EntryStage = 'seed' | 'sprouting' | 'ready' | 'used'
export interface Entry { id: string; kind: EntryKind; body: string; pillar: string; stage: EntryStage; created_at: Date }

export const listEntries = () => sql<Entry[]>`select id, kind, body, pillar, stage, created_at from entries order by created_at desc limit 500`

export const listIssues = () => sql<Issue[]>`select * from issues order by number desc`

export async function getIssue(id: string) {
  const [row] = await sql<Issue[]>`select * from issues where id = ${id}`
  return row ?? null
}

export async function getPublishedIssue(slug: string) {
  const [row] = await sql<Issue[]>`select * from issues where slug = ${slug} and status = 'published'`
  return row ?? null
}

export const listPublished = () =>
  sql<Pick<Issue, 'number' | 'slug' | 'title' | 'subject' | 'preview' | 'published_at'>[]>`
    select number, slug, title, subject, preview, published_at from issues
    where status = 'published' order by published_at desc`

export async function getSources(issueId: string) {
  return sql<Entry[]>`
    select e.id, e.kind, e.body, e.pillar, e.stage, e.created_at
    from issue_sources s join entries e on e.id = s.entry_id where s.issue_id = ${issueId}
    order by e.created_at`
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'issue'
