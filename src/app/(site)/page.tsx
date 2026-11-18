import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { publishedIssues } from "@/lib/issues";
import { allPillars } from "@/lib/pillars";
import { excerpt, renderMarkdown } from "@/lib/markdown";
import { SubscribeForm } from "@/components/SubscribeForm";
import { IssueList, formatDate } from "@/components/IssueList";
import { PageView } from "@/components/PageView";
import { SIGNUP_CONSENT_TEXT } from "@/lib/subscribers";
import { issueLabel } from "@/lib/email/templates";

export default async function Home() {
  const [s, issues, pillars] = await Promise.all([getSettings(), publishedIssues({ limit: 7 }), allPillars()]);
  const [latest, ...recent] = issues;

  return (
    <>
      <PageView path="/" />
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <p className="eyebrow">A personal letter from {s.authorName.split(" ")[0]}</p>
        <h1 className="wordmark mt-6 text-5xl leading-none text-ink sm:text-7xl">{s.name}</h1>
        <div className="mt-8 flex items-center gap-4" aria-hidden="true">
          <span className="h-px w-24 bg-bronze" />
        </div>
        <p className="mt-8 max-w-2xl font-serif text-2xl leading-snug text-ink sm:text-[2rem]">{s.tagline}</p>
        <p className="mt-5 max-w-xl font-serif text-lg leading-relaxed text-ink-soft">
          {s.description || "Thoughts on building, becoming, and making something meaningful of the life we're given."}
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a href="#subscribe" className="btn">
            Subscribe
          </a>
          {latest && (
            <Link href={`/issues/${latest.slug}`} className="btn btn-ghost">
              Read the latest letter
            </Link>
          )}
        </div>
      </section>

      {/* Featured issue */}
      {latest ? (
        <section className="border-y border-rule bg-card" aria-labelledby="latest-heading">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="latest-heading" className="eyebrow">
                The latest letter
              </h2>
              <p className="mt-3 text-sm text-muted">
                {issueLabel(latest.number)} · {formatDate(latest.publishedAt)}
                <br />
                {latest.readingMinutes} min read{latest.pillarName ? ` · ${latest.pillarName}` : ""}
              </p>
            </div>
            <article>
              <h3 className="font-serif text-3xl leading-tight sm:text-4xl">
                <Link href={`/issues/${latest.slug}`} className="hover:text-bronze">
                  {latest.title}
                </Link>
              </h3>
              <div
                className="prose-dash mt-5 text-ink-soft"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(excerpt(latest.bodyMd, 420)) }}
              />
              <Link href={`/issues/${latest.slug}`} className="link mt-5 inline-block text-sm">
                Continue reading
              </Link>
            </article>
          </div>
        </section>
      ) : (
        <section className="border-y border-rule bg-card">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <p className="eyebrow">The first letter</p>
            <p className="mt-3 max-w-xl font-serif text-xl leading-relaxed text-ink-soft">
              The first letter is being written. Subscribe below and it will arrive in your inbox when it&rsquo;s ready.
            </p>
          </div>
        </section>
      )}

      {/* About the publication */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6" aria-labelledby="why-heading">
        <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <h2 id="why-heading" className="eyebrow">
            Why &ldquo;The Dash&rdquo;
          </h2>
          <div className="prose-dash max-w-2xl">
            <p>
              On a gravestone there are two dates and a small line between them. That line holds everything: every
              decision, every person loved, every risk taken or avoided.
            </p>
            <p>
              We&rsquo;re all living in the space between who we are and who we might become. These letters are an
              ongoing attempt to make something meaningful of that space: honestly, without pretending to have it
              figured out.
            </p>
          </div>
        </div>
      </section>

      {/* Explore */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6" aria-labelledby="explore-heading">
        <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-4">
          <h2 id="explore-heading" className="eyebrow">
            Explore the writing
          </h2>
          <Link href="/archive" className="text-sm text-bronze hover:text-ink">
            All letters →
          </Link>
        </div>
        {recent.length > 0 && <IssueList items={recent} />}
        <ul className="mt-10 grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <li key={p.slug} className="bg-paper">
              <Link href={`/archive?theme=${p.slug}`} className="block h-full p-6 hover:bg-card">
                <h3 className="font-serif text-xl text-ink">{p.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>
              </Link>
            </li>
          ))}
          <li className="bg-paper">
            <Link href="/archive" className="flex h-full flex-col justify-between p-6 hover:bg-card">
              <span className="font-serif text-xl italic text-ink-soft">Or simply start at the beginning.</span>
              <span className="mt-4 text-sm text-bronze">Every letter →</span>
            </Link>
          </li>
        </ul>
      </section>

      {/* About Col */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6" aria-labelledby="col-heading">
        <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <h2 id="col-heading" className="eyebrow">
            Who&rsquo;s writing
          </h2>
          <div className="max-w-2xl">
            <p className="font-serif text-xl leading-relaxed text-ink">
              {s.authorBioShort ||
                "I'm Col, a young Canadian entrepreneur and builder working across businesses, real estate, community projects and creative ventures. I write to figure out what I actually believe."}
            </p>
            <Link href="/about" className="link mt-4 inline-block text-sm">
              More about me
            </Link>
          </div>
        </div>
      </section>

      {/* Subscribe */}
      <section id="subscribe" className="border-t border-rule bg-paper-deep/60" aria-labelledby="sub-heading">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="sub-heading" className="font-serif text-3xl leading-tight">
              Get the letter
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              One email when there&rsquo;s something worth saying. Reply any time: every response is read.
            </p>
          </div>
          <div className="max-w-xl">
            <SubscribeForm source="/#subscribe" consentText={SIGNUP_CONSENT_TEXT} />
          </div>
        </div>
      </section>
    </>
  );
}
