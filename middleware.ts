import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const DOMAIN_SLUG: Record<string, string> = {
  'lil-hub.vercel.app':        'lil',
  'supercycle-hub.vercel.app': 'supercycle',
  'hefe-hub.vercel.app':       'hefe',
  'freak-hub.vercel.app':      'freak',
  'bensi-hub.vercel.app':      'bensi',
  'dish-hub.vercel.app':       'dish',
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? ''
  const slug = DOMAIN_SLUG[host]

  if (slug) {
    const url = request.nextUrl.clone()
    // Rewrite root and any bare path to /[slug]/...
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = `/${slug}`
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-).*)'],
}
