'use client';

import { ReactNode } from 'react';
import { ExtensionBanner } from './ExtensionBanner';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

export function Layout({ children }: LayoutProps) {
  return (
    <div className="bg-dark-950 flex min-h-screen flex-col">
      {/* Background effects */}
      <div className="bg-grid-pattern bg-grid pointer-events-none fixed inset-0 opacity-10" />

      <div className="relative z-10 flex flex-1 flex-col">
        <ExtensionBanner />
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-dark-800 bg-dark-900/50 border-t">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-dark-500 text-center text-sm">
              Thyme v{appVersion} - Time Tracking for Business Central by{' '}
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green hover:text-knowall-green-light transition-colors"
              >
                KnowAll.ai
              </a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
