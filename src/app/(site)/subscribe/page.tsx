import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { SubscribeForm } from "@/components/SubscribeForm";
import { PageView } from "@/components/PageView";
import { SIGNUP_CONSENT_TEXT } from "@/lib/subscribers";

export const metadata: Metadata = { title: "Subscribe", alternates: { canonical: "/subscribe" } };

export default async function Subscribe() {
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-[40rem] px-4 pt-16 sm:px-6">
      <PageView path="/subscribe" kind="subscribe_view" />
      <p className="eyebrow">Subscribe</p>
      <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">{s.tagline}</h1>
      <div className="prose-dash mt-8 text-ink-soft">
        <p>
          The Dash is a personal letter from {s.authorName.split(" ")[0]}: on building, becoming, and making something
          meaningful of the life we&rsquo;re given.
        </p>
        <p>What to expect:</p>
        <ul>
          <li>One letter at a time, when there&rsquo;s something worth saying.</li>
          <li>Honest thinking, not finished answers.</li>
          <li>You can reply to any letter. Real person, real inbox.</li>
          <li>Unsubscribe in one click, any time.</li>
        </ul>
      </div>
      <div className="mt-10 card p-6 sm:p-8">
        {s.signupEnabled ? (
          <SubscribeForm source="/subscribe" consentText={SIGNUP_CONSENT_TEXT} />
        ) : (
          <p className="font-serif text-lg">Signups are paused for the moment. Please check back soon.</p>
        )}
        {s.doubleOptIn && s.signupEnabled && (
          <p className="mt-4 text-xs text-muted">You&rsquo;ll get one email asking you to confirm. Nothing else is sent until you do.</p>
        )}
      </div>
    </div>
  );
}
