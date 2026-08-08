/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O lint roda como task separada do turbo (não durante o build).
  eslint: { ignoreDuringBuilds: true },
  // Segredos/token vivem no backend; o web fala com a API server-side.
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;
