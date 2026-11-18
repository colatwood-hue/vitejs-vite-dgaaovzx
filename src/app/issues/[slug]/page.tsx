import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedIssue } from '@/lib/issues'
import { docToHtml } from '@/lib/render'
import { site } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata(props: PageProps<'/issues/[slug]'>): Promise<Metadata> {
  const issue = await getPublishedIssue((await props.params).slug)
  return issue ? { title: issue.title || issue.subject, description: issue.preview } : {}
}

export default async function IssuePage(props: PageProps<'/issues/[slug]'>) {
  const issue = await getPublishedIssue((await props.params).slug)
  if (!issue) notFound()
  const links = issue.links.filter((l) => l.url && l.title)
  const learning = issue.learning.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <Link href="/" className="eyebrow hover:text-accent">← {site.name}</Link>
      <article className="mt-12">
        <p className="eyebrow">
          No. {issue.number} · {issue.published_at?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.1] tracking-tight">{issue.title || issue.subject}</h1>
        {issue.opening && (
          <div className="mt-8 space-y-4 font-serif text-xl italic leading-relaxed text-muted">
            {issue.opening.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}
        <hr className="my-10 border-line" />
        <div className="prose-dash" dangerouslySetInnerHTML={{ __html: docToHtml(issue.body) }} />

        {learning.length > 0 && (
          <section className="mt-14">
            <h2 className="eyebrow !text-accent">What I&apos;m learning</h2>
            <ul className="mt-4 space-y-3 font-serif text-lg text-ink-2">
              {learning.map((l, i) => <li key={i}>— {l}</li>)}
            </ul>
          </section>
        )}
        {links.length > 0 && (
          <section className="mt-12">
            <h2 className="eyebrow !text-accent">Worth your time</h2>
            <ul className="mt-4 space-y-4 font-serif text-lg text-ink-2">
              {links.map((l, i) => (
                <li key={i}>
                  <a href={l.url} rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">{l.title}</a>
                  {l.why && <> — {l.why}</>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {issue.question && (
          <section className="mt-12 border-l-2 border-accent bg-wash px-6 py-5">
            <h2 className="eyebrow !text-accent">A question for you</h2>
            <p className="mt-3 font-serif text-xl">{issue.question}</p>
          </section>
        )}
        <p className="mt-12 font-serif text-lg">{site.signoff}<br />{site.author}</p>
      </article>
    </main>
  )
}
