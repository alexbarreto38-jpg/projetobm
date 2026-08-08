import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wise API Manager',
  description: 'Central de mensageria para o WhatsApp Business Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
