import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-rule/70">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6" aria-label="Main">
          <Link href="/" className="wordmark text-[0.95rem] text-ink">
            {s.name}
          </Link>
          <ul className="flex items-center gap-5 text-sm text-ink-soft sm:gap-7">
            <li>
              <Link href="/archive" className="hover:text-ink">
                Archive
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-ink">
                About
              </Link>
            </li>
            <li>
              <Link href="/subscribe" className="text-bronze hover:text-ink">
                Subscribe
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mt-24 border-t border-rule/70">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 text-sm text-muted sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
          <div className="space-y-2">
            <p className="wordmark text-xs text-ink">{s.name}</p>
            <p className="max-w-sm font-serif text-base italic leading-relaxed text-ink-soft">{s.tagline}</p>
            <p>
              A personal letter by {s.authorName}
              {s.parentBrand ? <> · part of <span className="text-ink-soft">{s.parentBrand}</span></> : null}
            </p>
          </div>
          <ul className="space-y-2">
            <li><Link href="/archive" className="hover:text-ink">All letters</Link></li>
            <li><Link href="/about" className="hover:text-ink">About Col</Link></li>
            <li><a href="/rss.xml" className="hover:text-ink">RSS</a></li>
          </ul>
          <ul className="space-y-2">
            <li><Link href="/subscribe" className="hover:text-ink">Subscribe</Link></li>
            <li><Link href="/preferences" className="hover:text-ink">Email preferences</Link></li>
            <li><Link href="/privacy" className="hover:text-ink">Privacy & contact</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
