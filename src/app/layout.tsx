import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/services/auth';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Thyme - Time Tracking for Business Central | KnowAll.ai',
  description:
    'Modern time tracking application that syncs with Microsoft Dynamics 365 Business Central. Track time, manage projects, and keep your data in sync. Built by KnowAll.ai.',
  keywords: ['time tracking', 'business central', 'dynamics 365', 'timesheet', 'knowall'],
  authors: [{ name: 'KnowAll.ai', url: 'https://knowall.ai' }],
  creator: 'KnowAll.ai',
  publisher: 'KnowAll.ai',
  metadataBase: new URL('https://thyme.knowall.ai'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'Thyme - Time Tracking for Business Central',
    description:
      'Modern time tracking application that syncs with Microsoft Dynamics 365 Business Central. Track time, manage projects, and keep your data in sync.',
    url: 'https://thyme.knowall.ai',
    siteName: 'Thyme by KnowAll.ai',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thyme - Time Tracking for Business Central',
    description:
      'Modern time tracking that syncs with Microsoft Dynamics 365 Business Central. Built by KnowAll.ai.',
    creator: '@knowall_ai',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
                  primary: '#00D26A',
                  secondary: '#fff',
                },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
