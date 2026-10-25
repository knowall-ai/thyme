import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import { AuthProvider } from '@/services/auth';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Timmie - Time Tracking for Business Central | KnowAll.ai',
  description:
    'Modern time tracking application that syncs with Microsoft Dynamics 365 Business Central. Track time, manage projects, and keep your data in sync. Built by KnowAll.ai.',
  keywords: ['time tracking', 'business central', 'dynamics 365', 'timesheet', 'knowall'],
  authors: [{ name: 'KnowAll.ai', url: 'https://knowall.ai' }],
  creator: 'KnowAll.ai',
  publisher: 'KnowAll.ai',
  metadataBase: new URL('https://gettimm.ie'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Timmie - Time Tracking for Business Central',
    description:
      'Modern time tracking application that syncs with Microsoft Dynamics 365 Business Central. Track time, manage projects, and keep your data in sync.',
    url: 'https://gettimm.ie',
    siteName: 'Timmie by KnowAll.ai',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Timmie - Time Tracking for Business Central',
    description:
      'Modern time tracking that syncs with Microsoft Dynamics 365 Business Central. Built by KnowAll.ai.',
    creator: '@knowall_ai',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so Next.js can stamp the CSP nonce from src/proxy.ts on its scripts
  await connection();
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-950 font-sans text-white">
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
              },
              success: {
                iconTheme: {
                  primary: 'var(--color-brand)',
                  secondary: 'var(--color-brand-foreground)',
                },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
