'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ClockIcon,
  FolderIcon,
  UserGroupIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useAuth, useProfilePhoto } from '@/services/auth';
import { useCompanyStore } from '@/hooks';
import { cn } from '@/utils';
import { ThymeLogo } from '@/components/icons';
import { CompanySwitcher } from './CompanySwitcher';

interface NavItem {
  name: string;
  href: string;
  icon: typeof ClockIcon;
}

const navigation: NavItem[] = [
  { name: 'Time', href: '/time', icon: ClockIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Team', href: '/team', icon: UserGroupIcon },
  { name: 'Plan', href: '/plan', icon: CalendarDaysIcon },
  { name: 'Approvals', href: '/approvals', icon: ClipboardDocumentCheckIcon },
  { name: 'Reports', href: '/reports', icon: ChartBarIcon },
];

export function Header() {
  const pathname = usePathname();
  const { account, logout, login, isAuthenticated, isLoading } = useAuth();
  const { photoUrl } = useProfilePhoto(isAuthenticated);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // selectedCompany used for context but not directly in render
  useCompanyStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch {
      toast.error('Failed to sign out. Please try again.');
    }
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch {
      toast.error('Failed to sign in. Please try again.');
    }
  };

  const isActive = (href: string) => {
    if (href === '/time') return pathname === '/time' || pathname.startsWith('/time');
    return pathname.startsWith(href);
  };

  return (
    <header className="border-dark-700 bg-dark-900 relative z-[70] border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* Logo and Navigation */}
          <div className="flex">
            {/* Logo - always links to home/landing */}
            <Link href="/" className="flex shrink-0 items-center">
              <div className="flex items-center gap-2">
                <div className="bg-knowall-green shadow-knowall-green/20 flex h-8 w-8 items-center justify-center rounded-lg shadow-lg">
                  <ThymeLogo className="text-dark-950 h-5 w-5" />
                </div>
                <span className="text-xl font-bold text-white">Thyme</span>
              </div>
            </Link>

            {/* Navigation - only shown when authenticated, hidden in print */}
            {isAuthenticated && (
              <nav className="hidden sm:ml-8 sm:flex sm:space-x-1 print:!hidden">
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
            )}
          </div>

          {/* Right side - hidden in print */}
          <div className="flex items-center gap-2 print:hidden">
            {isAuthenticated ? (
              <>
                {/* Settings icon */}
                <Link
                  href="/settings"
                  className={cn(
                    'hidden rounded-lg p-2 transition-colors sm:block',
                    isActive('/settings')
                      ? 'bg-knowall-green/10 text-knowall-green'
                      : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                  )}
                  title="Settings"
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </Link>

                {account && (
                  <>
                    <CompanySwitcher />

                    {/* User dropdown */}
                    <div className="relative" ref={userMenuRef}>
                      <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="hover:bg-dark-800 flex items-center gap-1 rounded-lg p-1 pr-2 transition-colors"
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={
                              account.name
                                ? `${account.name}'s profile photo`
                                : 'User profile photo'
                            }
                            className="border-knowall-green/30 h-9 w-9 rounded-full border object-cover"
                          />
                        ) : (
                          <div className="border-knowall-green/30 bg-knowall-green/20 flex h-9 w-9 items-center justify-center rounded-full border">
                            <span className="text-knowall-green text-sm font-medium">
                              {account.name
                                ?.trim()
                                .split(/\s+/)
                                .filter(Boolean)
                                .map((part) => (part ? Array.from(part)[0] : ''))
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <ChevronDownIcon
                          className={cn(
                            'text-dark-400 h-4 w-4 transition-transform',
                            isUserMenuOpen && 'rotate-180'
                          )}
                        />
                      </button>

                      {/* Dropdown menu */}
                      {isUserMenuOpen && (
                        <div className="border-dark-700 bg-dark-800 absolute top-full right-0 z-50 mt-2 w-56 rounded-lg border py-1 shadow-lg">
                          {/* User info */}
                          <div className="border-dark-700 border-b px-4 py-3">
                            <p className="text-sm font-medium text-white">{account.name}</p>
                            <p className="text-dark-400 text-xs">{account.username}</p>
                          </div>

                          {/* Sign out */}
                          <button
                            onClick={handleLogout}
                            className="text-dark-300 hover:bg-dark-700 flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:text-white"
                          >
                            <ArrowRightOnRectangleIcon className="h-4 w-4" />
                            Sign out
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Sign in button for unauthenticated users */
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="bg-knowall-green text-dark-950 hover:bg-knowall-green-light flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="border-dark-950/30 border-t-dark-950 h-4 w-4 animate-spin rounded-full border-2" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                    Sign in
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation - only for authenticated users, hidden in print */}
      {isAuthenticated && (
        <nav className="border-dark-700 border-t sm:hidden print:!hidden">
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
            {/* Settings in mobile nav */}
            <Link
              href="/settings"
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 text-xs font-medium transition-colors',
                isActive('/settings') ? 'text-knowall-green' : 'text-dark-400 hover:text-white'
              )}
            >
              <Cog6ToothIcon className="h-5 w-5" />
              Settings
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
