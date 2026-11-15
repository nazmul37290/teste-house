import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic check only (docs/auth.md section 8): is there a session cookie at all? It never
 * proves the session is valid; pages and the API check that server-side.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdmin = pathname.startsWith('/admin');
  if (isAdmin && pathname === '/admin/login') return NextResponse.next();

  const cookie = getSessionCookie(request, { cookiePrefix: isAdmin ? 'shop_a' : 'shop_c' });
  if (cookie) return NextResponse.next();

  const login = new URL(isAdmin ? '/admin/login' : '/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/admin/:path*', '/account/:path*'] };
