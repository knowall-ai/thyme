'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, BoltIcon } from '@heroicons/react/24/outline';

const DISMISSED_KEY = 'thyme_zaplie_banner_dismissed';

export function ZaplieBanner() {
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <div className="relative mb-6 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 p-4">
      {/* Dismiss button - absolute positioned */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10"
        aria-label="Dismiss"
      >
        <XMarkIcon className="h-5 w-5 text-white/70" />
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Zaplie Icon */}
        <div className="flex-shrink-0 self-start rounded-lg bg-white/10 p-2">
          <BoltIcon className="h-8 w-8 text-white" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 pr-6 sm:pr-0">
          <h3 className="text-sm font-semibold text-white">
            Automate Timesheet Reminders with Zaplie
          </h3>
          <p className="mt-0.5 text-sm text-white/80">
            Set up automated reminders for pending submissions, overdue timesheets, and weekly
            deadlines using Zaplie custom actions.
          </p>
        </div>

        {/* CTA */}
        <a
          href="https://github.com/knowall-ai/zaplie-customaction"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-6 flex-shrink-0 self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-white/90 sm:self-center"
        >
          Learn More
        </a>
      </div>
    </div>
  );
}
