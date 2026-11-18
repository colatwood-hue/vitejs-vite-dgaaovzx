import { z } from 'zod'
import { site } from './site'

export const uuid = z.uuid()

export const entryInput = z.object({
  body: z.string().trim().min(1, 'Write something first').max(20000),
  kind: z.enum(['observation', 'journal', 'voice_note', 'quote', 'question', 'reading']),
  pillar: z.enum(site.pillars),
})

const docNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.string().max(40),
    text: z.string().max(50000).optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(z.object({ type: z.string().max(40), attrs: z.record(z.string(), z.unknown()).optional() })).optional(),
    content: z.array(docNode).max(5000).optional(),
  }),
)

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => u === '' || /^https?:\/\//i.test(u), 'Links must start with http:// or https://')

export const issueInput = z.object({
  subject: z.string().max(200),
  preview: z.string().max(300),
  title: z.string().max(200),
  opening: z.string().max(5000),
  body: docNode,
  learning: z.string().max(5000),
  links: z.array(z.object({ title: z.string().max(200), url: httpUrl, why: z.string().max(500) })).max(5),
  question: z.string().max(1000),
})
export type IssueInput = z.infer<typeof issueInput>
