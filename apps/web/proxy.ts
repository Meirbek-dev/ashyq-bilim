import { getAbsoluteUrl } from './services/config/config';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /fonts (inside /public)
     * 4. Umami Analytics
     * 5. /examples (inside /public)
     * 6. all root files inside /public (e.g. /favicon.ico)
     */
    '/((?!api|_next|fonts|umami|examples|[\\w-]+\\.\\w+).*)',
    '/sitemap.xml',
  ],
};

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Standard path rewrites
  const standard_paths = ['/home'];
  const auth_paths = ['/login', '/signup', '/reset', '/forgot'];
  if (standard_paths.includes(pathname)) {
    // Redirect to the same pathname with the original search params
    return NextResponse.rewrite(new URL(`${pathname}${search}`, req.url));
  }

  if (auth_paths.includes(pathname)) {
    return NextResponse.rewrite(new URL(`/auth${pathname}${search}`, req.url));
  }

  // Dynamic Pages Editor
  if (/^\/course\/[^/]+\/activity\/[^/]+\/edit$/.exec(pathname)) {
    return NextResponse.rewrite(new URL(`/editor${pathname}`, req.url));
  }

  // Health Check
  if (pathname.startsWith('/health')) {
    return NextResponse.rewrite(new URL('/api/health', req.url));
  }

  // Auth Redirects
  if (pathname === '/redirect_from_auth') {
    const { searchParams } = req.nextUrl;
    const queryString = searchParams.toString();
    const redirectUrl = new URL(getAbsoluteUrl('/'), req.url);

    if (queryString) {
      redirectUrl.search = queryString;
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith('/sitemap.xml')) {
    return NextResponse.rewrite(new URL('/api/sitemap', req.url));
  }

  return NextResponse.next();
}
