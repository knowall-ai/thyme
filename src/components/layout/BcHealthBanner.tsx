'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui';
import { BC_UNREACHABLE_EVENT, describeBcHealth } from '@/utils';
import type { BcHealth } from '@/utils';

// Many calls fail at once in an outage: ask once for all of them
const MIN_CHECK_INTERVAL_MS = 15_000;
// While Business Central is failing, ask again so the banner clears itself
const RECHECK_MS = 60_000;
// Microsoft 365 admin center's Service health: the signed-in admin's own tenant
const SERVICE_HEALTH_URL = 'https://admin.microsoft.com/#/servicehealth';

/**
 * App-wide notice when Business Central itself is failing, so an empty page isn't
 * taken for Thyme being broken. Asked for only when a Business Central call gets no
 * response (BC_UNREACHABLE_EVENT): Thyme's server then checks Business Central (see
 * /api/health/bc), so the user's own connection dropping shows nothing.
 */
export function BcHealthBanner() {
  const [health, setHealth] = useState<BcHealth | null>(null);
  const lastCheck = useRef(0);
  // The latest check: an older one answering last mustn't overwrite it
  const latestRequest = useRef(0);

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - lastCheck.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheck.current = Date.now();
    const requestId = ++latestRequest.current;
    try {
      const response = await fetch('/api/health/bc', { cache: 'no-store' });
      if (!response.ok) return;
      const health = (await response.json()) as BcHealth;
      if (requestId === latestRequest.current) setHealth(health);
    } catch {
      // Thyme's own server can't be reached either: nothing useful to say about BC
    }
  }, []);

  useEffect(() => {
    const onUnreachable = () => void check();
    window.addEventListener(BC_UNREACHABLE_EVENT, onUnreachable);
    return () => window.removeEventListener(BC_UNREACHABLE_EVENT, onUnreachable);
  }, [check]);

  const message = health ? describeBcHealth(health.status) : null;
  useEffect(() => {
    if (!message) return;
    const timer = setInterval(() => void check(true), RECHECK_MS);
    return () => clearInterval(timer);
  }, [message, check]);

  if (!message) return null;

  return (
    <div role="alert" className="border-b border-yellow-500/30 bg-yellow-500/10 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-8">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-yellow-100">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-yellow-500" />
          <span>
            {message}{' '}
            <a
              href={SERVICE_HEALTH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-300 underline underline-offset-2 hover:text-yellow-200"
            >
              Microsoft 365 Service health
            </a>{' '}
            (admins).
          </span>
        </p>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void check(true)}>
          Check again
        </Button>
      </div>
    </div>
  );
}
