import type { Metadata } from "next";
import { confirmAction } from "@/actions/confirm";
import { TokenActionForm } from "@/components/TokenActionForm";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-[36rem] px-4 pt-20 sm:px-6">
      <p className="eyebrow">One last step</p>
      <h1 className="mt-4 font-serif text-4xl">Confirm your subscription</h1>
      <p className="mt-4 font-serif text-lg text-ink-soft">Click below to confirm you&rsquo;d like to receive The Dash by email.</p>
      <div className="mt-8">
        {token ? (
          <TokenActionForm action={confirmAction} token={token} label="Yes, subscribe me" pendingLabel="Confirming…" />
        ) : (
          <p className="text-danger">This confirmation link is missing its token.</p>
        )}
      </div>
    </div>
  );
}
