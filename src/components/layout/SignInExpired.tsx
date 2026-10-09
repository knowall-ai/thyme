'use client';

import { LockClosedIcon } from '@heroicons/react/24/outline';
import { signInAgain, useReauthStore } from '@/services/auth';
import { Button, Card } from '@/components/ui';
import { Layout } from './Layout';

/**
 * Shown instead of "Couldn't load your Business Central companies" when the real
 * problem is an expired Microsoft sign-in: retrying can't help, signing in again can.
 */
export function SignInExpired() {
  const redirecting = useReauthStore((state) => state.status === 'redirecting');

  return (
    <Layout hideSignInBanner>
      <Card variant="bordered" className="mx-auto max-w-lg p-8">
        <div className="flex flex-col items-center text-center">
          <LockClosedIcon className="text-dark-400 mb-4 h-12 w-12" />
          <h1 className="mb-2 text-lg font-semibold text-white">Your sign-in has expired</h1>
          <p className="text-dark-300 mb-6 text-sm">
            {redirecting
              ? 'Taking you to Microsoft to sign in again. You’ll come back to this page afterwards.'
              : 'Microsoft needs you to sign in again (or verify it’s you) before Thyme can reach Business Central. You’ll come back to this page afterwards.'}
          </p>
          <Button onClick={() => void signInAgain()} isLoading={redirecting}>
            Sign in again
          </Button>
        </div>
      </Card>
    </Layout>
  );
}
