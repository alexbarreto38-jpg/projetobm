import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wise API Manager',
  description: 'Central de mensageria para o WhatsApp Business Platform',
};

// Renderização dinâmica em todas as rotas: o CSP com nonce por requisição
// (middleware, spec §47) precisa que o Next assine seus scripts a cada request.
// Páginas pré-renderizadas (estáticas) não recebem o nonce e, sob
// 'strict-dynamic', ficariam sem hidratação. Este painel é totalmente
// autenticado — não há conteúdo estático a cachear.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
