import 'server-only'
import { generateHTML } from '@tiptap/html/server'
import type { JSONContent } from '@tiptap/core'
import { editorExtensions } from './content'

const SAFE_HREF = /^(https?:|mailto:)/i

/**
 * Tiptap JSON → HTML on the server. Output is limited to the editor schema; as defense
 * in depth we also strip any href that is not http(s)/mailto.
 */
export function docToHtml(doc: JSONContent) {
  let html: string
  try {
    html = generateHTML(doc, editorExtensions)
  } catch {
    return ''
  }
  return html.replace(/href="([^"]*)"/g, (_, h: string) => (SAFE_HREF.test(h.replace(/&amp;/g, '&')) ? `href="${h}"` : 'href="#"'))
}

export function docToText(doc: JSONContent): string {
  const walk = (n: JSONContent): string =>
    n.text ?? (n.content ?? []).map(walk).join(n.type === 'doc' ? '\n\n' : n.type === 'paragraph' || n.type === 'heading' ? '' : ' ')
  return walk(doc)
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length
