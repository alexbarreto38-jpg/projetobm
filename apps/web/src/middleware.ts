import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'wise_session';

/**
 * Protege as rotas do painel: sem sessão → /login. A autorização real (RBAC,
 * isolamento por tenant) acontece no backend (spec §10) — isto é só UX.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (!hasSession && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (hasSession && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
