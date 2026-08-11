// Cabeçalhos de segurança (spec §47). O Content-Security-Policy é montado por
// requisição no middleware (nonce por request para os scripts do Next); aqui
// ficam apenas os cabeçalhos estáticos. Ajuste `connect-src` no middleware se
// adicionar telemetria (ex.: Sentry) no cliente.
const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
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
