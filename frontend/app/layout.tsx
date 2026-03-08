import type { Metadata, Viewport } from 'next';
import './globals.css';
import WakeLock from '@/components/WakeLock';

export const metadata: Metadata = {
  title: 'הגדה של פסח אינטראקטיבית | AI Haggadah',
  description: 'חוו את ליל הסדר יחד — הצטרפו עם קישור, צלמו סלפי, והופיעו בסצנות AI מיציאת מצרים.',
};

export const viewport: Viewport = {
  themeColor: '#FDFBF7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="exodus-bg" aria-hidden="true" />
        <WakeLock />
        {children}
      </body>
    </html>
  );
}
