'use client';

import Link from 'next/link';
import { ThymeLogo } from '@/components/icons';

interface PublicPageLayoutProps {
  children: React.ReactNode;
}

const footerLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/eula', label: 'EULA' },
  { href: '/help', label: 'Help' },
];

export function PublicPageLayout({ children }: PublicPageLayoutProps) {
  return (
    <div className="bg-dark-950 min-h-screen">
      {/* Background effects */}
      <div className="bg-grid-pattern bg-grid pointer-events-none fixed inset-0 opacity-20" />
      <div className="bg-gradient-radial from-knowall-green/5 pointer-events-none fixed inset-0 via-transparent to-transparent" />

      {/* Header */}
      <header className="border-dark-800 relative z-10 border-b">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="bg-knowall-green shadow-knowall-green/20 flex h-10 w-10 items-center justify-center rounded-lg shadow-lg">
                <ThymeLogo className="text-dark-950 h-6 w-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-white">Thyme</span>
                <span className="text-dark-400 ml-2 hidden text-sm sm:inline">by KnowAll.ai</span>
              </div>
            </Link>

            <nav className="hidden items-center gap-6 sm:flex">
              <Link
                href="/help"
                className="text-dark-400 text-sm transition-colors hover:text-white"
              >
                Help
              </Link>
              <Link
                href="/pricing"
                className="text-dark-400 text-sm transition-colors hover:text-white"
              >
                Pricing
              </Link>
              <Link
                href="/"
                className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-dark-800 relative z-10 border-t py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="bg-knowall-green flex h-8 w-8 items-center justify-center rounded-lg">
                <ThymeLogo className="text-dark-950 h-5 w-5" />
              </div>
              <span className="font-semibold text-white">Thyme</span>
              <span className="text-dark-500">by</span>
              <a
                href="https://knowall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-knowall-green hover:text-knowall-green-light transition-colors"
              >
                KnowAll.ai
              </a>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-dark-400 text-sm transition-colors hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="text-dark-500 mt-6 text-center text-sm">
            &copy; {new Date().getFullYear()} KnowAll.ai Ltd. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
