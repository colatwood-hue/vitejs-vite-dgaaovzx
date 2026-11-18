'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  ATTACHMENT_TYPES, CAPTURE_KINDS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS,
  createCapture, deleteCapture, getCapture, promoteCapture, updateCapture, type CaptureInput,
} from '@/lib/knowledge'
import { requireStudio } from '@/lib/session'
import { uuid } from '@/lib/validation'

export type CaptureState = { error?: string; ok?: boolean; id?: string } | undefined

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((u) => u || null)
  .refine((u) => u === null || /^https?:\/\/\S+$/i.test(u), 'Links must start with http:// or https://')

const captureSchema = z.object({
  kind: z.enum(CAPTURE_KINDS),
  title: z.string().trim().max(300),
  content: z.string().max(50000),
  source_url: optionalUrl,
  attribution: z.string().trim().max(300),
  source_title: z.string().trim().max(300),
  source_locator: z.string().trim().max(200),
  occurred_at: z
    .string()
    .trim()
    .transform((d) => (d ? new Date(d) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), 'That date is not valid'),
  reaction: z.string().max(50000),
  tags: z.string().max(1000).transform((t) => t.split(',').map((x) => x.trim()).filter(Boolean)),
})

function readCapture(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? '')
  return captureSchema.safeParse({
    kind: get('kind') || 'thought', title: get('title'), content: get('content'), source_url: get('source_url'),
    attribution: get('attribution'), source_title: get('source_title'), source_locator: get('source_locator'),
    occurred_at: get('occurred_at'), reaction: get('reaction'), tags: get('tags'),
  })
}

async function readFiles(form: FormData) {
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_ATTACHMENTS) return { error: `Attach at most ${MAX_ATTACHMENTS} files.` }
  const total = files.reduce((n, f) => n + f.size, 0)
  if (total > MAX_ATTACHMENT_BYTES) return { error: 'Attachments must total 4 MB or less.' }
  const out = []
  for (const f of files) {
    const mime = f.type.split(';')[0].trim().toLowerCase()
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(mime)) return { error: `${f.name}: that file type isn't supported (audio, images, PDF or text only).` }
    const filename = f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'attachment'
    out.push({ filename, mime_type: mime, data: Buffer.from(await f.arrayBuffer()) })
  }
  return { files: out }
}

export async function createCaptureAction(_: CaptureState, form: FormData): Promise<CaptureState> {
  await requireStudio()
  const parsed = readCapture(form)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid capture' }
  const files = await readFiles(form)
  if ('error' in files) return { error: files.error }
  const d = parsed.data
  if (!d.title.trim() && !d.content.trim() && !d.reaction.trim() && !d.source_url && files.files.length === 0)
    return { error: 'Capture something first: text, a link, a voice note or a file.' }
  const input: CaptureInput = { ...d }
  // A voice note or file on its own still needs a non-empty row: give it a title.
  if (!d.title.trim() && !d.content.trim() && !d.reaction.trim() && !d.source_url) input.title = files.files[0].filename
  const id = await createCapture(input, files.files)
  revalidatePath('/studio/library')
  return { ok: true, id }
}

export async function updateCaptureAction(id: string, _: CaptureState, form: FormData): Promise<CaptureState> {
  await requireStudio()
  const captureId = uuid.parse(id)
  const prev = await getCapture(captureId)
  if (!prev) return { error: 'Not found' }
  const parsed = readCapture(form)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid capture' }
  const summary = String(form.get('summary') ?? '').slice(0, 5000)
  const transcript = String(form.get('transcript') ?? '').slice(0, 100000)
  const d = parsed.data
  if (!d.title.trim() && !d.content.trim() && !d.reaction.trim() && !d.source_url) return { error: 'A capture needs a title, text, reaction or link.' }
  await updateCapture(captureId, { ...d, summary, transcript }, prev)
  revalidatePath(`/studio/library/${captureId}`)
  revalidatePath('/studio/library')
  return { ok: true }
}

export async function deleteCaptureAction(id: string) {
  await requireStudio()
  await deleteCapture(uuid.parse(id))
  revalidatePath('/studio/library')
  redirect('/studio/library')
}

export async function promoteCaptureAction(id: string): Promise<CaptureState> {
  await requireStudio()
  const entryId = await promoteCapture(uuid.parse(id))
  if (!entryId) return { error: 'Not found' }
  revalidatePath(`/studio/library/${id}`)
  revalidatePath('/studio')
  return { ok: true, id: entryId }
}

