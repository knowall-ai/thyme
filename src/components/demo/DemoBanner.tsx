'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { BeakerIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui';
import { useAuth } from '@/services/auth';
import { exitDemo } from '@/services/demo/demoMode';
import { useIsDemoMode } from '@/services/demo/useIsDemoMode';

/** Links into Business Central itself, which the demo company doesn't exist in */
function isBusinessCentralLink(href: string): boolean {
  try {
    return new URL(href, window.location.href).hostname.endsWith('businesscentral.dynamics.com');
  } catch {
    return false;
  }
}

/**
 * The bar across the top of every page in the demo: says it's sample data, and offers
 * the way out (Exit demo, back to the landing page) and the way in (Sign in). Nothing
 * shows outside the demo.
 */
export function DemoBanner() {
  const isDemo = useIsDemoMode();
  const { login } = useAuth();

  // "Open in Business Central" links would open a company that isn't there
  useEffect(() => {
    if (!isDemo) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!link || !isBusinessCentralLink(link.getAttribute('href') ?? '')) return;
      event.preventDefault();
      event.stopPropagation();
      toast("Opening Business Central isn't available in the demo.", { icon: 'ℹ️' });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isDemo]);

  if (!isDemo) return null;

  const handleSignIn = async () => {
    try {
      await login();
    } catch {
      // useAuth has already said sign-in failed
    }
  };

  return (
    <div
      role="region"
      aria-label="Demo mode"
      className="border-knowall-green/40 bg-dark-900/95 sticky top-0 z-[80] border-b backdrop-blur print:hidden"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <p className="flex min-w-0 items-center gap-2 text-sm text-white">
          <BeakerIcon className="text-knowall-green h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">You&apos;re viewing a demo with sample data.</span>{' '}
            <span className="text-dark-300">
              Contoso Ltd is fictional; your changes stay in this browser tab.
            </span>
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => exitDemo()}>
            Exit demo
          </Button>
          <Button size="sm" onClick={handleSignIn}>
            Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
