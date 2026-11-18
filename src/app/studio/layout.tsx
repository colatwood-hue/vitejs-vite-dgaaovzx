import Link from 'next/link'
import { requireStudio } from '@/lib/session'
import { site } from '@/lib/site'
import { logout } from '../login/actions'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  await requireStudio()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/studio" className="font-serif text-xl">
            {site.name} <span className="eyebrow ml-1 align-middle">Studio</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/studio" className="btn btn-ghost btn-sm">Inbox</Link>
            <Link href="/studio/issues" className="btn btn-ghost btn-sm">Issues</Link>
            <Link href="/studio/playbook" className="btn btn-ghost btn-sm">Playbook</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="btn btn-ghost btn-sm" target="_blank">View site ↗</Link>
            <form action={logout}><button className="btn btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
