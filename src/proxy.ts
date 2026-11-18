import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

// Fast redirect for signed-out visitors. Every studio page and action also calls requireStudio().
export async function proxy(req: NextRequest) {
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = { matcher: ['/studio/:path*'] }
