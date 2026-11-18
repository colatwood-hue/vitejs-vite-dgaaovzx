'use client'

import { useActionState } from 'react'
import { updateCaptureAction } from '../actions'

const KINDS = ['thought', 'quote', 'book', 'film', 'social_post', 'conversation', 'experience', 'journal', 'other'] as const

interface Props {
  capture: Record<'id' | 'kind' | 'title' | 'content' | 'source_url' | 'attribution' | 'source_title' | 'source_locator' | 'occurred_at' | 'reaction' | 'summary' | 'transcript' | 'tags', string>
}

export function EditCapture({ capture: c }: Props) {
  const [state, action, pending] = useActionState(updateCaptureAction.bind(null, c.id), undefined)
  return (
    <details className="mt-6 rounded-xl border border-line bg-sheet p-4">
      <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Type
          <select name="kind" defaultValue={c.kind} className="field mt-1">{KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select>
        </label>
        <label className="block text-sm">Title<input name="title" defaultValue={c.title} className="field mt-1" /></label>
        <label className="block text-sm sm:col-span-2">Original source text (verbatim)<textarea name="content" defaultValue={c.content} rows={3} className="field mt-1 font-serif italic" /></label>
        <label className="block text-sm sm:col-span-2">Link<input name="source_url" defaultValue={c.source_url} className="field mt-1" /></label>
        <label className="block text-sm">By<input name="attribution" defaultValue={c.attribution} className="field mt-1" /></label>
        <label className="block text-sm">From<input name="source_title" defaultValue={c.source_title} className="field mt-1" /></label>
        <label className="block text-sm">Where in it<input name="source_locator" defaultValue={c.source_locator} className="field mt-1" /></label>
        <label className="block text-sm">Encountered<input name="occurred_at" type="date" defaultValue={c.occurred_at} className="field mt-1" /></label>
        <label className="block text-sm sm:col-span-2">Your words / reaction<textarea name="reaction" defaultValue={c.reaction} rows={4} className="field mt-1 font-serif" /></label>
        <label className="block text-sm sm:col-span-2">Summary<textarea name="summary" defaultValue={c.summary} rows={2} className="field mt-1" /></label>
        <label className="block text-sm sm:col-span-2">Transcript<textarea name="transcript" defaultValue={c.transcript} rows={3} className="field mt-1" /></label>
        <label className="block text-sm sm:col-span-2">Tags<input name="tags" defaultValue={c.tags} className="field mt-1" /></label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
          {state?.ok && <span role="status" className="text-sm text-ok">Saved.</span>}
          {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        </div>
      </form>
    </details>
  )
}
