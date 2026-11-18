import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { renderMarkdown } from "@/lib/markdown";
import { SubscribeForm } from "@/components/SubscribeForm";
import { SIGNUP_CONSENT_TEXT } from "@/lib/subscribers";

export const metadata: Metadata = { title: "About Col", alternates: { canonical: "/about" } };

const DEFAULT_ABOUT = `I'm Col Atwood, a young Canadian entrepreneur, builder and operator. I work across businesses, real estate, community projects and creative ventures.

**Who Is Col** is the broader home for my work. It's built around one idea I keep coming back to: that we can deliberately shape who we become, through imagination, action, courage, responsibility and experience.

**The Dash** is where I think out loud about that. It's about building things, yes, but also about relationships, faith and meaning, risk and failure, adventure, and learning to appreciate the present while working hard on the future. Those last two don't always sit comfortably together. I'd rather write about that tension honestly than pretend it isn't there.

I don't have it figured out. These letters are how I'm trying to.`;

export default async function About() {
  const s = await getSettings();
  const contact = s.contactEmail || s.replyToEmail;
  return (
    <div className="mx-auto max-w-[44rem] px-4 pt-16 sm:px-6">
      <p className="eyebrow">About</p>
      <h1 className="mt-4 font-serif text-4xl sm:text-5xl">Hi, I&rsquo;m {s.authorName.split(" ")[0]}.</h1>
      <div className="mt-6 h-px w-16 bg-bronze" aria-hidden="true" />
      <div className="prose-dash mt-10" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.aboutMd || DEFAULT_ABOUT) }} />
      {contact && (
        <p className="mt-10 font-serif text-xl">
          The best way to reach me is to reply to any letter, or write to{" "}
          <a className="link" href={`mailto:${contact}`}>
            {contact}
          </a>
          .
        </p>
      )}
      <section className="mt-16 card p-6 sm:p-8">
        <h2 className="font-serif text-2xl">Read along</h2>
        <div className="mt-5">
          <SubscribeForm source="/about" compact consentText={SIGNUP_CONSENT_TEXT} />
        </div>
      </section>
    </div>
  );
}
