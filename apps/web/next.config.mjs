/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O lint roda como task separada do turbo (não durante o build).
  eslint: { ignoreDuringBuilds: true },
  // API_URL é lido em RUNTIME pelo servidor Next (server components/route
  // handlers) — não embutimos no bundle para funcionar em Docker/produção.
};

export default nextConfig;
