import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setupAction } from "@/actions/auth";
import { hasAnyUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ActionForm } from "@/components/studio/ActionForm";

export const metadata: Metadata = { title: "Studio setup", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Setup() {
  if (await hasAnyUser()) redirect("/studio/login");
  const enabled = env.setupToken().length >= 8;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <p className="wordmark text-sm">The Dash</p>
      <h1 className="mt-3 font-serif text-3xl">Create the studio owner</h1>
      {!enabled ? (
        <p className="mt-6 text-sm leading-relaxed text-ink-soft">
          Setup is locked. Set a <code>SETUP_TOKEN</code> environment variable (at least 8 characters) and reload, or run{" "}
          <code>npm run admin:create</code> from a terminal.
        </p>
      ) : (
        <ActionForm action={setupAction} submitLabel="Create account" pendingLabel="Creating…" className="mt-8 space-y-4">
          <div>
            <label htmlFor="token" className="field-label">
              Setup token
            </label>
            <input id="token" name="token" type="password" required className="input" />
            <p className="field-hint">The value of SETUP_TOKEN from your environment.</p>
          </div>
          <div>
            <label htmlFor="name" className="field-label">
              Your name
            </label>
            <input id="name" name="name" defaultValue="Col Atwood" required className="input" />
          </div>
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="username" required className="input" />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="input" />
            <p className="field-hint">At least 12 characters. A passphrase is ideal.</p>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
