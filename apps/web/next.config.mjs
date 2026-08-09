// Cabeçalhos de segurança (spec §47). CSP permite o necessário para o Next
// (styles inline do runtime; scripts do próprio host). Ajuste `connect-src` se
// adicionar telemetria (ex.: Sentry) no cliente.
const isProd = process.env.NODE_ENV === 'production';
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Em dev o Next usa eval para HMR; em produção não.
  isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "connect-src 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O lint roda como task separada do turbo (não durante o build).
  eslint: { ignoreDuringBuilds: true },
  // API_URL é lido em RUNTIME pelo servidor Next (server components/route
  // handlers) — não embutimos no bundle para funcionar em Docker/produção.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
