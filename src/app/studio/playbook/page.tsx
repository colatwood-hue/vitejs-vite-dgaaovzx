import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'
import { requireStudio } from '@/lib/session'

export const metadata = { title: 'Playbook' }

export default async function PlaybookPage() {
  await requireStudio()
  // Trusted, repo-owned markdown.
  const md = await readFile(path.join(process.cwd(), 'framework', 'PLAYBOOK.md'), 'utf8')
  const html = await marked.parse(md)
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
      <div className="prose-dash prose-base [&_table]:block [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
