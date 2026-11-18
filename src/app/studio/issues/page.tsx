import Link from 'next/link'
import { listIssues } from '@/lib/issues'
import { requireStudio } from '@/lib/session'
import { StatusBadge } from './StatusBadge'

export const metadata = { title: 'Issues' }

export default async function IssuesPage() {
  await requireStudio()
  const issues = await listIssues()
  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:px-6">
      <h1 className="font-serif text-4xl">Letters</h1>
      <p className="mt-2 text-[15px] text-ink-2">Start a new letter from the Inbox, so every issue is grounded in something you actually captured.</p>
      {issues.length === 0 ? (
        <p className="mt-10 font-serif text-lg italic text-muted">No letters yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {issues.map((i) => (
            <li key={i.id}>
              <Link href={`/studio/issues/${i.id}`} className="flex items-center gap-4 py-4 hover:bg-wash/50">
                <span className="w-14 font-serif text-sm text-muted">No. {i.number}</span>
                <span className="flex-1 font-serif text-xl">{i.title || i.subject || <em className="text-muted">Untitled</em>}</span>
                <StatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
