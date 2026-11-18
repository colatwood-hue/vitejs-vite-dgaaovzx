import Link from 'next/link'
import { requireStudio } from '@/lib/session'
import { site } from '@/lib/site'
import { logout } from '../login/actions'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireStudio()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/studio" className="font-serif text-xl">
            {site.name} <span className="eyebrow ml-1 align-middle">Studio</span>
          </Link>
          <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
            <Link href="/studio/capture" className="btn btn-ghost btn-sm">Capture</Link>
            <Link href="/studio/library" className="btn btn-ghost btn-sm">Library</Link>
            <Link href="/studio" className="btn btn-ghost btn-sm">Ideas</Link>
            <Link href="/studio/issues" className="btn btn-ghost btn-sm">Letters</Link>
            <Link href="/studio/subscribers" className="btn btn-ghost btn-sm">Readers</Link>
            <Link href="/studio/playbook" className="btn btn-ghost btn-sm">Playbook</Link>
          </nav>
          <div className="flex items-center gap-1">
            <a href="/studio/export" className="btn btn-ghost btn-sm" title="Download all your data as JSON">Export</a>
            <Link href="/" className="btn btn-ghost btn-sm hidden sm:inline-flex" target="_blank">View site ↗</Link>
            <form action={logout}><button className="btn btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
