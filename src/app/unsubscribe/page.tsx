import Link from 'next/link'
import { TokenAction } from '@/components/TokenAction'
import { site } from '@/lib/site'
import { unsubscribeAction } from '../public-actions'

export const metadata = { title: 'Unsubscribe', robots: { index: false } }

export default async function UnsubscribePage(props: PageProps<'/unsubscribe'>) {
  const token = (await props.searchParams).token
  return (
    <main className="mx-auto max-w-lg px-4 py-24 sm:px-6">
      <Link href="/" className="eyebrow hover:text-accent">← {site.name}</Link>
      <h1 className="mt-8 font-serif text-4xl">Unsubscribe</h1>
      {typeof token === 'string' && token ? (
        <>
          <p className="mt-4 text-ink-2">You&apos;ll stop receiving {site.name}. No hard feelings, and thank you for reading.</p>
          <TokenAction action={unsubscribeAction} token={token} label="Unsubscribe me" done={<>Done. You won&apos;t get any more letters.</>} />
        </>
      ) : (
        <p role="alert" className="mt-4 text-danger">This unsubscribe link is incomplete.</p>
      )}
    </main>
  )
}
