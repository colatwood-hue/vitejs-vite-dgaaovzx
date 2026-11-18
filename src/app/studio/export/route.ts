import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import { exportAll } from '@/lib/knowledge'

export async function GET() {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) return new Response('Unauthorized', { status: 401 })
  const data = await exportAll()
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="the-dash-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
