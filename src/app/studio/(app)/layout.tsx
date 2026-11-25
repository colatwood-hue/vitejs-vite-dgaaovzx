import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { StudioBottomNav, StudioSidebar } from "@/components/studio/StudioNav";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const simulated = env.emailProvider() !== "resend";
  return (
    <div className="min-h-dvh bg-paper">
      {simulated && (
        <div className="border-b border-[#e8d49a] bg-[#fff4d6] px-4 py-1.5 text-center text-xs text-[#5c4a12]">
          Email is in <strong>simulated</strong> mode: nothing is actually delivered. Configure a provider in Settings.
        </div>
      )}
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-rule px-3 py-6 md:flex">
          <Link href="/studio" className="px-3">
            <span className="wordmark text-xs">The Dash</span>
            <span className="mt-1 block text-xs text-muted">Editorial studio</span>
          </Link>
          <Link href="/studio/inbox#capture" className="btn mx-3 mt-6">
            + Capture a thought
          </Link>
          <form action="/studio/search" role="search" className="mx-3 mt-4">
            <label htmlFor="studio-search" className="sr-only">
              Search everything
            </label>
            <input id="studio-search" name="q" placeholder="Search everything…" className="input py-1.5 text-sm" />
          </form>
          <div className="mt-5 flex-1">
            <StudioSidebar />
          </div>
          <div className="space-y-2 px-3 text-xs text-muted">
            <Link href="/" className="block hover:text-ink" target="_blank">
              View public site ↗
            </Link>
            <p className="truncate">{user.email}</p>
            <form action={logoutAction}>
              <button className="hover:text-ink">Sign out</button>
            </form>
          </div>
        </aside>
        <div className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 md:pb-16">
          <div className="mb-4 flex items-center justify-between md:hidden">
            <span className="wordmark text-xs">The Dash · Studio</span>
            <span className="flex gap-2">
              <Link href="/studio/search" className="btn btn-ghost btn-sm" aria-label="Search">
                Search
              </Link>
              <Link href="/studio/inbox#capture" className="btn btn-sm">
                + Capture
              </Link>
            </span>
          </div>
          {children}
        </div>
      </div>
      <StudioBottomNav />
    </div>
  );
}
