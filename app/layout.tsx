import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NORTHLINE — Frontier Command',
  description: 'Тактическая браузерная стратегия о базе, разведке, территориях и командирах северного рубежа.',
  applicationName: 'NORTHLINE',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#101416',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
