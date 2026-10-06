'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

// Shown in Plan modals when units of measure couldn't be loaded; saving is blocked meanwhile
export function UomLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
    >
      <span className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
        Couldn&apos;t load units of measure, so hours can&apos;t be converted for saving.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 font-medium text-red-200 underline hover:text-white"
      >
        Retry
      </button>
    </div>
  );
}
