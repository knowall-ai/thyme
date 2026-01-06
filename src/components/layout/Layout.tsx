'use client';

import { ReactNode } from 'react';
import { ExtensionBanner } from './ExtensionBanner';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-dark-950">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 bg-grid-pattern bg-grid opacity-10" />

      <div className="relative z-10">
        <ExtensionBanner />
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        <footer className="mt-auto border-t border-dark-800 bg-dark-900/50">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-2 text-sm text-dark-500">
              <span>Thyme</span>
              <span>-</span>
              <span>Time Tracking for Business Central</span>
              <span>by</span>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green transition-colors hover:text-knowall-green-light"
              >
                KnowAll.ai
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
