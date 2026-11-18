import { requireStudio } from '@/lib/session'
import { listSubscribers, subscriberCounts } from '@/lib/subscribers'
import { AddSubscribers } from './AddSubscribers'
import { RemoveButton } from './RemoveButton'

export const metadata = { title: 'Readers' }

const LABEL = { pending: 'Awaiting confirmation', active: 'Active', unsubscribed: 'Unsubscribed', bounced: 'Bounced', complained: 'Marked as spam' } as const
const SOURCE = { web_form: 'Signed up', personal_invite: 'Added by you', import: 'Imported' } as const

export default async function SubscribersPage() {
  await requireStudio()
  const [people, counts] = await Promise.all([listSubscribers(), subscriberCounts()])
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6">
      <h1 className="font-serif text-4xl">Readers</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        Everyone here either confirmed by email or told you yourself that they want it. Unsubscribes, bounces and spam complaints are permanent, and nothing here can re-add them.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => (
          <div key={k} className="rounded-lg border border-line bg-sheet px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted">{LABEL[k]}</dt>
            <dd className="font-serif text-3xl" data-testid={`count-${k}`}>{counts[k] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <AddSubscribers />

      <section className="mt-10">
        <h2 className="eyebrow">Everyone</h2>
        {people.length === 0 ? (
          <p className="mt-4 font-serif text-lg italic text-muted">No readers yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-sheet">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line"><th className="px-4 py-2">Email</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">How</th><th className="px-4 py-2">Since</th><th /></tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{p.email}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2" data-testid="sub-status">{LABEL[p.status]}</td>
                    <td className="px-4 py-2 text-muted">{SOURCE[p.consent_source]}</td>
                    <td className="px-4 py-2 text-muted">{(p.consent_at ?? p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-4 py-2 text-right">{(p.status === 'active' || p.status === 'pending') && <RemoveButton id={p.id} email={p.email} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
