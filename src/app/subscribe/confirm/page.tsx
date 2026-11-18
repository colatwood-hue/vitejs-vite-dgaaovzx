import Link from 'next/link'
import { TokenAction } from '@/components/TokenAction'
import { site } from '@/lib/site'
import { confirm } from '../../public-actions'

export const metadata = { title: 'Confirm subscription', robots: { index: false } }

export default async function ConfirmPage(props: PageProps<'/subscribe/confirm'>) {
  const token = (await props.searchParams).token
  return (
    <main className="mx-auto max-w-lg px-4 py-24 sm:px-6">
      <Link href="/" className="eyebrow hover:text-accent">← {site.name}</Link>
      <h1 className="mt-8 font-serif text-4xl">One last step.</h1>
      {typeof token === 'string' && token ? (
        <>
          <p className="mt-4 text-ink-2">Confirm you&apos;d like to receive {site.name} by email.</p>
          <TokenAction action={confirm} token={token} label="Confirm my subscription" done={<>You&apos;re in. The next letter will find you. <Link href="/" className="text-accent underline">Read the archive</Link>.</>} />
        </>
      ) : (
        <p role="alert" className="mt-4 text-danger">This confirmation link is incomplete.</p>
      )}
    </main>
  )
}
