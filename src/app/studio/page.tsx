import { listEntries } from '@/lib/issues'
import { requireStudio } from '@/lib/session'
import { site } from '@/lib/site'
import { CaptureForm } from './CaptureForm'
import { EntryBoard } from './EntryBoard'

export const metadata = { title: 'Inbox' }

export default async function StudioHome() {
  await requireStudio()
  const entries = await listEntries()
  const developing = entries.filter((e) => e.stage === 'sprouting' || e.stage === 'ready').length
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      <p className="eyebrow">Step 1 · Capture</p>
      <h1 className="mt-2 font-serif text-4xl">What did you notice?</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        Raw material only: things you saw, lived, read or wondered. Don&apos;t polish. Every letter is built from these. Nothing gets invented.
      </p>
      <CaptureForm pillars={[...site.pillars]} />
      {developing < 3 && (
        <p className="mt-4 rounded-md bg-wash px-4 py-2.5 text-sm text-ink-2">
          Keep at least three entries <b>Sprouting</b> or <b>Ready</b> and you&apos;ll never face a blank page. You have {developing}.
        </p>
      )}
      <EntryBoard entries={entries.map((e) => ({ ...e, created_at: e.created_at.toISOString() }))} />
    </main>
  )
}
