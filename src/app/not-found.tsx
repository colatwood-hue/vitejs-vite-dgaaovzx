import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-serif text-4xl">Nothing here.</h1>
      <Link href="/" className="btn mt-8">Back to the letters</Link>
    </main>
  )
}
