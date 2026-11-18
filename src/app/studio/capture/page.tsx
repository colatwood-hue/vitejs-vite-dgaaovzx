import { requireStudio } from '@/lib/session'
import { CaptureForm } from './CaptureForm'

export const metadata = { title: 'Capture' }

export default async function CapturePage() {
  await requireStudio()
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-serif text-4xl">Capture</h1>
      <p className="mt-1 mb-6 text-[15px] text-ink-2">Anything worth keeping. It stays private in your library until you choose otherwise.</p>
      <CaptureForm />
    </main>
  )
}
