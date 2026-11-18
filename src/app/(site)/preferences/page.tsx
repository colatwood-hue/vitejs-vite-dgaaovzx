import type { Metadata } from "next";
import Link from "next/link";
import { findByManageToken, getPreferences } from "@/lib/subscribers";
import { PreferencesForm } from "@/components/PreferencesForm";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

export default async function Preferences({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const sub = token ? await findByManageToken(token) : null;
  const prefs = sub ? await getPreferences(sub.id) : null;
  return (
    <div className="mx-auto max-w-[36rem] px-4 pt-20 sm:px-6">
      <p className="eyebrow">Email preferences</p>
      <h1 className="mt-4 font-serif text-4xl">Your subscription</h1>
      {!sub || !prefs ? (
        <p className="mt-6 font-serif text-lg text-ink-soft">
          To manage your subscription, use the &ldquo;Email preferences&rdquo; link at the bottom of any letter. Your link is
          personal, so there&rsquo;s no password to remember. You can also reply to any letter and ask.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {sub.email} · {sub.status === "active" ? "Subscribed" : sub.status === "pending" ? "Awaiting confirmation" : "Not subscribed"}
          </p>
          {sub.status === "active" ? (
            <div className="mt-8 card p-6">
              <PreferencesForm token={token} name={sub.name} newsletter={prefs.newsletter} occasionalUpdates={prefs.occasionalUpdates} />
            </div>
          ) : (
            <p className="mt-6 font-serif text-lg text-ink-soft">
              You&rsquo;re not currently receiving letters.{" "}
              <Link href="/subscribe" className="link">
                Subscribe again
              </Link>{" "}
              if you&rsquo;d like to.
            </p>
          )}
          {sub.status === "active" && (
            <p className="mt-6 text-sm">
              <Link href={`/unsubscribe?token=${encodeURIComponent(token)}`} className="link">
                Unsubscribe from everything
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
