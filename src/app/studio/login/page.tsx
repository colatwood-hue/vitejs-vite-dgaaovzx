import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/actions/auth";
import { currentUser, hasAnyUser } from "@/lib/auth";
import { ActionForm } from "@/components/studio/ActionForm";

export const metadata: Metadata = { title: "Studio sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Login() {
  if (await currentUser()) redirect("/studio");
  const needsSetup = !(await hasAnyUser());
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <p className="wordmark text-sm">The Dash</p>
      <h1 className="mt-3 font-serif text-3xl">Studio</h1>
      {needsSetup ? (
        <p className="mt-6 text-sm text-ink-soft">
          No owner account exists yet.{" "}
          <Link href="/studio/setup" className="link">
            Set up the studio
          </Link>
          .
        </p>
      ) : (
        <ActionForm action={loginAction} submitLabel="Sign in" pendingLabel="Signing in…" className="mt-8 space-y-4">
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
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
