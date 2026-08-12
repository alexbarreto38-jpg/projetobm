import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'wise_session';
const isProd = process.env.NODE_ENV === 'production';

/**
 * Monta o CSP por requisição com um nonce para os scripts do Next (spec §47).
 * NÃO usamos 'unsafe-inline' em script-src: o Next assina seus scripts de
 * bootstrap com este nonce e carrega os demais chunks via 'strict-dynamic'.
 * Isso mantém a hidratação funcionando sob uma política estrita em produção —
 * sem o nonce, os scripts inline de streaming do App Router são bloqueados e o
 * painel fica sem interatividade.
 */
function buildCsp(nonce: string): string {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : // Em dev o Next usa eval para HMR.
      `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src 'self'",
  ].join('; ');
}

/**
 * Protege as rotas do painel: sem sessão → /login. A autorização real (RBAC,
 * isolamento por tenant) acontece no backend (spec §10) — isto é só UX.
 * Também aplica o CSP com nonce por requisição (spec §47).
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (!hasSession && !pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  // NÃO redirecionamos /login → /dashboard só porque existe cookie: se o cookie
  // estiver inválido/expirado (ou a API indisponível), o layout do dashboard
  // devolveria para /login e isso criaria um loop de redirecionamento
  // (ERR_TOO_MANY_REDIRECTS). Deixar /login sempre renderizável quebra o ciclo.

  // btoa/crypto estão disponíveis no edge runtime do middleware.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // O Next lê o CSP do header do request para assinar seus scripts com o nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Todas as rotas de documento; exclui assets estáticos (carregados via
  // strict-dynamic a partir do bootstrap com nonce) e prefetches do Next.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
