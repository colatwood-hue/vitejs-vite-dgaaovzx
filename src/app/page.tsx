import Link from 'next/link'
import { listPublished } from '@/lib/issues'
import { site } from '@/lib/site'
import { SubscribeForm } from '@/components/SubscribeForm'
import { emailConfigured } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

const fmt = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '')

export default async function Home() {
  const issues = await listPublished()
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
      <header>
        <p className="eyebrow">A letter from {site.author}</p>
        <h1 className="mt-4 font-serif text-6xl font-normal tracking-tight sm:text-7xl">
          {site.name.split(' ').map((w, i) => (i === 0 ? <span key={i}>{w} </span> : <em key={i} className="text-accent">{w}</em>))}
        </h1>
        <p className="mt-6 font-serif text-2xl leading-snug text-ink-2">{site.tagline}</p>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{site.description}</p>
        <div className="mt-8">
          {emailConfigured() ? (
            <SubscribeForm />
          ) : (
            <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
              Subscriptions open soon. For now, this letter goes to people I know personally.
            </p>
          )}
        </div>
      </header>

      <section className="mt-20">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="eyebrow">The archive</h2>
          <span className="text-xs text-muted">{issues.length} {issues.length === 1 ? 'letter' : 'letters'}</span>
        </div>
        {issues.length === 0 ? (
          <p className="py-10 font-serif text-lg italic text-muted">The first letter is still being written.</p>
        ) : (
          <ol>
            {issues.map((i) => (
              <li key={i.slug} className="border-b border-line">
                <Link href={`/issues/${i.slug}`} className="group grid grid-cols-[3.5rem_1fr] gap-x-4 py-6">
                  <span className="pt-1 font-serif text-sm text-muted">No. {i.number}</span>
                  <span>
                    <span className="block font-serif text-2xl leading-tight group-hover:text-accent">{i.title || i.subject}</span>
                    {i.preview && <span className="mt-1 block text-[15px] text-ink-2">{i.preview}</span>}
                    <span className="mt-2 block text-xs text-muted">{fmt(i.published_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="mt-20 flex justify-between text-xs text-muted">
        <span>© {new Date().getFullYear()} {site.author}</span>
        <Link href="/studio" className="hover:text-ink">Studio</Link>
      </footer>
    </main>
  )
}
