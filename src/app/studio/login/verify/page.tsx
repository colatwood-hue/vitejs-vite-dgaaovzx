import type { Metadata } from "next";
import Link from "next/link";
import { verifyCodeAction } from "@/actions/auth";
import { ActionForm } from "@/components/studio/ActionForm";

export const metadata: Metadata = { title: "Two-factor sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function Verify() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <p className="wordmark text-sm">The Dash</p>
      <h1 className="mt-3 font-serif text-3xl">One more step</h1>
      <p className="mt-3 text-sm text-ink-soft">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      <ActionForm action={verifyCodeAction} submitLabel="Verify" pendingLabel="Checking…" className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="field-label">
            Code
          </label>
          <input id="code" name="code" autoComplete="one-time-code" inputMode="text" autoFocus required className="input font-mono text-lg tracking-widest" />
        </div>
      </ActionForm>
      <Link href="/studio/login" className="mt-6 text-xs text-muted underline">
        Start over
      </Link>
    </div>
  );
}
