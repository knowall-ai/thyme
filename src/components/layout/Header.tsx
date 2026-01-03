'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClockIcon,
  FolderIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/services/auth';
import { cn } from '@/utils';

const navigation = [
  { name: 'Time', href: '/', icon: ClockIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export function Header() {
  const pathname = usePathname();
  const { account, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="bg-dark-900 border-b border-dark-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo and Navigation */}
          <div className="flex">
            {/* Logo */}
            <Link href="/" className="flex items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-knowall-green rounded-lg flex items-center justify-center shadow-lg shadow-knowall-green/20">
                  <ClockIcon className="w-5 h-5 text-dark-950" />
                </div>
                <span className="text-xl font-bold text-white">Thyme</span>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden sm:ml-8 sm:flex sm:space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                      active
                        ? 'bg-knowall-green/10 text-knowall-green'
                        : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {account && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-white">
                    {account.name}
                  </p>
                  <p className="text-xs text-dark-400">{account.username}</p>
                </div>
                <div className="w-10 h-10 bg-knowall-green/20 rounded-full flex items-center justify-center border border-knowall-green/30">
                  <span className="text-sm font-medium text-knowall-green">
                    {account.name
                      ?.split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav className="sm:hidden border-t border-dark-700">
        <div className="flex justify-around">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-3 px-4 text-xs font-medium transition-colors',
                  active ? 'text-knowall-green' : 'text-dark-400 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
