'use client';

import { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-dark-950">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-10 pointer-events-none" />

      <div className="relative z-10">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="bg-dark-900/50 border-t border-dark-800 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-center gap-2 text-sm text-dark-500">
              <span>Thyme</span>
              <span>-</span>
              <span>Time Tracking for Business Central</span>
              <span>by</span>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green hover:text-knowall-green-light transition-colors"
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
