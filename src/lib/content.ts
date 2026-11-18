import StarterKit from '@tiptap/starter-kit'
import type { JSONContent } from '@tiptap/core'

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [] }

/** Shared by the client editor and server-side HTML generation, so stored JSON is always schema-constrained. */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    codeBlock: false,
    code: false,
    link: { openOnClick: false, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer' } },
  }),
]
