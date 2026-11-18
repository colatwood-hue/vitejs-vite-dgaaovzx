import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { renderMarkdown } from "@/lib/markdown";
import { PRIVACY_TEMPLATE, fillPrivacyTemplate } from "@/lib/privacy-template";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Privacy & contact", alternates: { canonical: "/privacy" } };

export default async function Privacy() {
  const s = await getSettings();
  const md = fillPrivacyTemplate(s.privacyPolicyMd || PRIVACY_TEMPLATE, {
    author: s.authorName,
    brand: s.parentBrand,
    contact: s.contactEmail || s.replyToEmail,
    address: s.mailingAddress,
    emailProvider: env.emailProvider() === "resend" ? "Resend" : "our email provider",
  });
  return (
    <div className="mx-auto max-w-[44rem] px-4 pt-16 sm:px-6">
      <p className="eyebrow">Privacy & contact</p>
      <h1 className="mt-4 font-serif text-4xl">How your information is handled</h1>
      <div className="prose-dash mt-10 text-[1.08rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
      <section className="mt-14 border-t border-rule pt-8">
        <h2 className="eyebrow">Contact</h2>
        <p className="mt-3 font-serif text-lg">
          {s.authorName}
          {s.contactEmail && (
            <>
              <br />
              <a href={`mailto:${s.contactEmail}`} className="link">
                {s.contactEmail}
              </a>
            </>
          )}
          {s.mailingAddress && (
            <>
              <br />
              <span className="whitespace-pre-line text-ink-soft">{s.mailingAddress}</span>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
