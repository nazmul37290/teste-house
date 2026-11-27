import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * Three jobs:
 * 0. Same-origin API: /api/v1/* is forwarded to the API (API_INTERNAL_URL, read at runtime). The
 *    next.config.ts rewrite does the same but is fixed when the app is built, so a Docker image
 *    built without the variable would point at localhost; this runtime forward always wins.
 * 1. Optimistic sign-in check for /admin and /account (docs/auth.md section 8): is there a session
 *    cookie at all? It never proves the session is valid; pages and the API check that.
 * 2. Shop status (docs/design.md section 17): in maintenance, shoppers get the maintenance page with
 *    HTTP 503 (search engines keep the pages indexed), signed-in admins still see the shop. This is
 *    not a security boundary: the API itself refuses new orders while in maintenance.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // First: the API answers for itself (auth, maintenance, permissions).
  if (pathname.startsWith('/api/v1/'))
    return NextResponse.rewrite(new URL(`${pathname}${search}`, API));

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    return requireCookie(request, 'shop_a', '/admin/login', `${pathname}${search}`);
  }

  // Orders already under way finish: gateway returns and confirmation pages stay open.
  const alwaysOpen = pathname.startsWith('/payment/') || pathname.startsWith('/order/');
  if (!alwaysOpen) {
    const maintenance = (await storeMode()) === 'maintenance';
    if (pathname === '/maintenance') {
      // Admins may preview it any time; shoppers only see it while it applies.
      if (!maintenance && !(await isAdmin(request)))
        return NextResponse.redirect(new URL('/', request.url));
      return withStatus(NextResponse.next(), maintenance);
    }
    if (maintenance && !(await isAdmin(request))) {
      return withStatus(
        NextResponse.rewrite(new URL('/maintenance', request.url), { status: 503 }),
        true,
      );
    }
  }

  if (pathname.startsWith('/account'))
    return requireCookie(request, 'shop_c', '/login', `${pathname}${search}`);
  return NextResponse.next();
}

function requireCookie(request: NextRequest, prefix: string, loginPath: string, next: string) {
  if (getSessionCookie(request, { cookiePrefix: prefix })) return NextResponse.next();
  const login = new URL(loginPath, request.url);
  login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}

function withStatus(res: NextResponse, maintenance: boolean) {
  if (maintenance) {
    res.headers.set('Retry-After', '600');
    res.headers.set('Cache-Control', 'no-store');
  }
  return res;
}

// Shop status, read at most every 10 seconds per server process. If the API cannot be reached the
// last known status stays (live at start), so an API restart never closes the shop by itself.
let mode: { value: 'live' | 'maintenance'; at: number } = { value: 'live', at: 0 };

async function storeMode(): Promise<'live' | 'maintenance'> {
  if (Date.now() - mode.at < 10_000) return mode.value;
  try {
    const res = await fetch(`${API}/api/v1/settings/public`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    const body = (await res.json()) as { data?: Record<string, unknown> };
    if (res.ok)
      mode = {
        value: body.data?.['store.mode'] === 'maintenance' ? 'maintenance' : 'live',
        at: Date.now(),
      };
  } catch {
    mode = { ...mode, at: Date.now() }; // try again in 10 seconds
  }
  return mode.value;
}

// Signed-in admins, confirmed by the API (GET /admin/auth/me) and remembered for a minute.
const admins = new Map<string, number>();

async function isAdmin(request: NextRequest): Promise<boolean> {
  const token = getSessionCookie(request, { cookiePrefix: 'shop_a' });
  if (!token) return false;
  const until = admins.get(token);
  if (until && until > Date.now()) return true;
  try {
    const res = await fetch(`${API}/api/v1/admin/auth/me`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    if (admins.size > 500) admins.clear();
    admins.set(token, Date.now() + 60_000);
    return true;
  } catch {
    return false;
  }
}

// Every API call (also paths with an extension, like export.csv), plus every page except Next
// internals, the web app's own /api routes and files (paths with an extension).
export const config = {
  matcher: ['/api/v1/:path*', '/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)'],
};
