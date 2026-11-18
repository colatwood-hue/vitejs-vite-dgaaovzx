import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAction } from "@/actions/public";
import { TokenActionForm } from "@/components/TokenActionForm";
import { findByManageToken } from "@/lib/subscribers";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const sub = token ? await findByManageToken(token) : null;
  return (
    <div className="mx-auto max-w-[36rem] px-4 pt-20 sm:px-6">
      <p className="eyebrow">Unsubscribe</p>
      {!sub ? (
        <>
          <h1 className="mt-4 font-serif text-4xl">We couldn&rsquo;t find that subscription</h1>
          <p className="mt-4 font-serif text-lg text-ink-soft">
            The link may be incomplete. Use the unsubscribe link at the bottom of any letter, or simply reply to one and
            ask, and you&rsquo;ll be removed by hand.
          </p>
        </>
      ) : sub.status === "unsubscribed" ? (
        <>
          <h1 className="mt-4 font-serif text-4xl">You&rsquo;re already unsubscribed</h1>
          <p className="mt-4 font-serif text-lg text-ink-soft">You won&rsquo;t receive any more letters.</p>
        </>
      ) : (
        <>
          <h1 className="mt-4 font-serif text-4xl">Stop receiving The Dash?</h1>
          <p className="mt-4 font-serif text-lg text-ink-soft">
            {sub.email} will be removed immediately. No hard feelings. Thank you for reading.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <TokenActionForm action={unsubscribeAction} token={token} label="Unsubscribe" pendingLabel="Unsubscribing…" danger />
            <Link href={`/preferences?token=${encodeURIComponent(token)}`} className="link text-sm">
              Change preferences instead
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
