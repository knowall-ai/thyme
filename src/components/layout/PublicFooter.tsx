'use client';

import Link from 'next/link';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid';
import { ThymeLogo } from '@/components/icons';

const footerSections = [
  {
    title: 'Product',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: 'https://github.com/user/thyme-bc-extension', label: 'BC Extension', external: true },
      { href: 'https://appsource.microsoft.com', label: 'AppSource', external: true },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/help', label: 'Help & FAQs' },
      { href: 'mailto:support@knowall.ai', label: 'Contact Support', external: true },
      {
        href: 'https://github.com/knowall-ai/thyme/issues',
        label: 'Report an Issue',
        external: true,
      },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/eula', label: 'EULA' },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-dark-800 bg-dark-900/50 relative z-10 border-t">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="bg-knowall-green shadow-knowall-green/20 flex h-10 w-10 items-center justify-center rounded-lg shadow-lg">
                <ThymeLogo className="text-dark-950 h-6 w-6" />
              </div>
              <span className="text-xl font-bold text-white">Thyme</span>
            </div>
            <p className="text-dark-400 mt-4 max-w-xs text-sm leading-relaxed">
              Modern time tracking for Microsoft Dynamics 365 Business Central.
            </p>
            <a
              href="https://knowall.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-knowall-green hover:text-knowall-green-light mt-3 inline-block text-sm transition-colors"
            >
              Built by KnowAll.ai
            </a>
          </div>

          {/* Link sections */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-white">{section.title}</h3>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dark-400 inline-flex items-center gap-1 text-sm transition-colors hover:text-white"
                      >
                        {link.label}
                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-dark-400 text-sm transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-dark-800 mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
          <p className="text-dark-500 text-sm">
            &copy; {new Date().getFullYear()} KnowAll AI SAS de CV. All rights reserved.
          </p>
          <p className="text-dark-500 text-sm">Time Tracking for Business Central</p>
        </div>
      </div>
    </footer>
  );
}
