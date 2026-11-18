import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { getAttachment } from '@/lib/knowledge'
import { uuid } from '@/lib/validation'

const INLINE = /^(audio|image)\/|^application\/pdf$/

export async function GET(_: Request, ctx: RouteContext<'/studio/attachments/[id]'>) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  if (!uuid.safeParse(id).success) return new Response('Not found', { status: 404 })
  const a = await getAttachment(id)
  if (!a) return new Response('Not found', { status: 404 })
  const disposition = INLINE.test(a.mime_type) ? 'inline' : 'attachment'
  return new Response(new Uint8Array(a.data), {
    headers: {
      'Content-Type': a.mime_type,
      'Content-Length': String(a.size_bytes),
      'Content-Disposition': `${disposition}; filename="${a.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
