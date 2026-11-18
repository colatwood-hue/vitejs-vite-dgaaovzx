import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { renderIssueEmail, renderIssueText } from '@/lib/email'
import { getIssue } from '@/lib/issues'
import { uuid } from '@/lib/validation'

export async function GET(req: Request, ctx: RouteContext<'/studio/issues/[id]/preview'>) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) return new Response('Unauthorized', { status: 401 })
  const { id } = await ctx.params
  if (!uuid.safeParse(id).success) return new Response('Not found', { status: 404 })
  const issue = await getIssue(id)
  if (!issue) return new Response('Not found', { status: 404 })

  const format = new URL(req.url).searchParams.get('format')
  const download = new URL(req.url).searchParams.has('download')
  const text = format === 'text'
  const body = text ? await renderIssueText(issue) : await renderIssueEmail(issue)
  return new Response(body, {
    headers: {
      'Content-Type': text ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(download && { 'Content-Disposition': `attachment; filename="the-dash-${issue.number}.${text ? 'txt' : 'html'}"` }),
    },
  })
}
