import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adjacentIssues, publishedIssueBySlug } from "@/lib/issues";
import { excerpt, renderMarkdown } from "@/lib/markdown";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { issueLabel } from "@/lib/email/templates";
import { SubscribeForm } from "@/components/SubscribeForm";
import { ShareActions } from "@/components/ShareActions";
import { PageView } from "@/components/PageView";
import { formatDate } from "@/components/IssueList";
import { SIGNUP_CONSENT_TEXT } from "@/lib/subscribers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const row = await publishedIssueBySlug(slug);
  if (!row) return { title: "Not found" };
  const { issue } = row;
  const description = issue.subtitle || issue.previewText || excerpt(issue.bodyMd, 160);
  return {
    title: issue.title,
    description,
    alternates: { canonical: `/issues/${issue.slug}` },
    openGraph: {
      type: "article",
      title: issue.title,
      description,
      url: `/issues/${issue.slug}`,
      publishedTime: issue.publishedAt?.toISOString(),
      authors: ["Col Atwood"],
    },
    twitter: { card: "summary", title: issue.title, description },
  };
}

export default async function IssuePage({ params }: Props) {
  const { slug } = await params;
  const row = await publishedIssueBySlug(slug);
  if (!row) notFound();
  const { issue, pillarName, pillarSlug } = row;
  const [s, adj] = await Promise.all([getSettings(), adjacentIssues(issue.publishedAt!)]);
  const url = `${env.appUrl()}/issues/${issue.slug}`;
  const replyTo = s.contactEmail || s.replyToEmail;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: issue.title,
    description: issue.subtitle || issue.previewText,
    datePublished: issue.publishedAt?.toISOString(),
    dateModified: issue.updatedAt.toISOString(),
    author: { "@type": "Person", name: s.authorName },
    publisher: { "@type": "Organization", name: s.name },
    mainEntityOfPage: url,
  };

  return (
    <article className="mx-auto max-w-[44rem] px-4 pt-14 sm:px-6 sm:pt-20">
      <PageView path={`/issues/${issue.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header>
        <p className="eyebrow">
          {s.name} · {issueLabel(issue.number)}
        </p>
        <h1 className="mt-5 font-serif text-[2.4rem] leading-[1.12] tracking-tight text-ink sm:text-[3.2rem]">{issue.title}</h1>
        {issue.subtitle && <p className="mt-4 font-serif text-xl italic leading-relaxed text-ink-soft sm:text-2xl">{issue.subtitle}</p>}
        <p className="mt-6 flex flex-wrap gap-x-2 text-sm text-muted">
          <time dateTime={issue.publishedAt?.toISOString()}>{formatDate(issue.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{issue.readingMinutes} min read</span>
          {pillarName && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/archive?theme=${pillarSlug}`} className="hover:text-ink">
                {pillarName}
              </Link>
            </>
          )}
        </p>
        <div className="mt-8 h-px w-16 bg-bronze" aria-hidden="true" />
      </header>

      <div className="prose-dash mt-10" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.bodyMd) }} />

      {issue.recommendationMd.trim() && (
        <aside className="mt-14 border-t border-rule pt-8" aria-labelledby="rec-heading">
          <h2 id="rec-heading" className="eyebrow text-bronze">
            Worth your time
          </h2>
          <div className="prose-dash mt-4 text-[1.1rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.recommendationMd) }} />
        </aside>
      )}

      {issue.closingMd.trim() && (
        <section className="mt-14 border-t border-rule pt-8" aria-labelledby="close-heading">
          <h2 id="close-heading" className="eyebrow text-bronze">
            Something to sit with
          </h2>
          <div className="prose-dash mt-4 italic" dangerouslySetInnerHTML={{ __html: renderMarkdown(issue.closingMd) }} />
        </section>
      )}

      <section className="mt-14 border-t border-rule pt-8">
        <p className="font-serif text-xl leading-relaxed">
          If something here stirred a thought, I&rsquo;d love to hear it.
          {replyTo && (
            <>
              {" "}
              <a className="link" href={`mailto:${replyTo}?subject=${encodeURIComponent(`Re: ${issue.title}`)}`}>
                Write back
              </a>
              .
            </>
          )}
        </p>
        <p className="mt-2 font-serif text-xl">— {s.authorName.split(" ")[0]}</p>
        <div className="mt-8">
          <ShareActions url={url} title={issue.title} />
        </div>
      </section>

      <section className="mt-16 card p-6 sm:p-8" aria-labelledby="sub-inline">
        <h2 id="sub-inline" className="font-serif text-2xl">
          Get the next letter
        </h2>
        <p className="mt-2 text-sm text-muted">{s.tagline}</p>
        <div className="mt-5">
          <SubscribeForm source={`/issues/${issue.slug}`} compact consentText={SIGNUP_CONSENT_TEXT} />
        </div>
      </section>

      {(adj.prev || adj.next) && (
        <nav className="mt-14 grid gap-4 border-t border-rule pt-8 text-sm sm:grid-cols-2" aria-label="More letters">
          {adj.prev ? (
            <Link href={`/issues/${adj.prev.slug}`} className="group">
              <span className="eyebrow">Previous</span>
              <span className="mt-1 block font-serif text-lg text-ink group-hover:text-bronze">{adj.prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {adj.next && (
            <Link href={`/issues/${adj.next.slug}`} className="group sm:text-right">
              <span className="eyebrow">Next</span>
              <span className="mt-1 block font-serif text-lg text-ink group-hover:text-bronze">{adj.next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
