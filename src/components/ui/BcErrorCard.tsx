'use client';

import { useState } from 'react';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { explainBcError } from '@/utils';
import { Button } from './Button';

interface BcErrorCardProps {
  /** What couldn't be loaded, e.g. "Couldn't load this project's time and cost figures" */
  title: string;
  /** The error, as thrown or as a message */
  error: unknown;
  /** Try again; shown as a Retry button */
  onRetry?: () => void | Promise<void>;
}

/**
 * A Business Central failure in plain words, with a Retry button and the technical
 * details (for support) tucked away.
 */
export function BcErrorCard({ title, error, onRetry }: BcErrorCardProps) {
  const [retrying, setRetrying] = useState(false);
  const { message } = explainBcError(error);
  const details = error instanceof Error ? error.message : String(error ?? '');

  const retry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <ExclamationTriangleIcon className="h-8 w-8 text-red-400" />
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-dark-300 mt-1 text-sm">{message}</p>
        </div>
        {onRetry && (
          <Button size="sm" onClick={() => void retry()} isLoading={retrying}>
            <ArrowPathIcon className="mr-1.5 h-4 w-4" />
            Retry
          </Button>
        )}
        {details && (
          <details className="text-dark-400 w-full max-w-2xl text-left text-xs">
            <summary className="hover:text-dark-200 cursor-pointer text-center">
              Technical details
            </summary>
            <p className="bg-dark-900/60 mt-2 rounded p-3 font-mono break-all">{details}</p>
          </details>
        )}
      </div>
    </div>
  );
}
