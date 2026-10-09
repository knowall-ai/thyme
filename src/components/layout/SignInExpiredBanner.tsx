'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { signInAgain, useReauthStore } from '@/services/auth';
import { Button } from '@/components/ui';

/**
 * App-wide prompt when the Microsoft sign-in has expired and Thyme didn't redirect
 * automatically (it already tried recently, or it's in a popup/frame). Pages that
 * render straight away would otherwise just show empty data.
 */
export function SignInExpiredBanner() {
  const status = useReauthStore((state) => state.status);
  if (status === 'idle') return null;
  const redirecting = status === 'redirecting';

  return (
    <div role="alert" className="border-b border-yellow-500/30 bg-yellow-500/10 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 text-sm text-yellow-100">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-yellow-500" />
          {redirecting
            ? 'Your sign-in has expired. Taking you to Microsoft to sign in again…'
            : 'Your sign-in has expired. Sign in again to keep working with Business Central.'}
        </p>
        <Button size="sm" onClick={() => void signInAgain()} isLoading={redirecting}>
          Sign in again
        </Button>
      </div>
    </div>
  );
}
