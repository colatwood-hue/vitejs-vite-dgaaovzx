import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-4 font-serif text-4xl">This page isn&rsquo;t here.</h1>
      <p className="mt-4 font-serif text-lg text-ink-soft">It may have moved, or it was never written.</p>
      <Link href="/" className="btn btn-ghost mt-8">
        Back to The Dash
      </Link>
    </div>
  );
}
