'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClockIcon,
  FolderIcon,
  UserGroupIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth, useProfilePhoto } from '@/services/auth';
import { cn } from '@/utils';

const navigation = [
  { name: 'Time', href: '/', icon: ClockIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Team', href: '/team', icon: UserGroupIcon },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export function Header() {
  const pathname = usePathname();
  const { account, logout, isAuthenticated } = useAuth();
  const { photoUrl } = useProfilePhoto(isAuthenticated);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="border-b border-dark-700 bg-dark-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and Navigation */}
          <div className="flex">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-knowall-green shadow-lg shadow-knowall-green/20">
                  <ClockIcon className="h-5 w-5 text-dark-950" />
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
                      'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-knowall-green/10 text-knowall-green'
                        : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5" />
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
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium text-white">{account.name}</p>
                  <p className="text-xs text-dark-400">{account.username}</p>
                </div>
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={account.name || 'Profile'}
                    className="h-10 w-10 rounded-full border border-knowall-green/30 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-knowall-green/30 bg-knowall-green/20">
                    <span className="text-sm font-medium text-knowall-green">
                      {account.name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                )}
                <button
                  onClick={logout}
                  className="rounded-lg p-2 text-dark-400 transition-colors hover:bg-dark-800 hover:text-white"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav className="border-t border-dark-700 sm:hidden">
        <div className="flex justify-around">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-4 py-3 text-xs font-medium transition-colors',
                  active ? 'text-knowall-green' : 'text-dark-400 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
