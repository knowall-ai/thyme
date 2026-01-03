'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const DISMISSED_KEY = 'thyme_teams_bot_banner_dismissed';

export function TeamsBotBanner() {
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
    <div className="relative mb-6 rounded-lg bg-gradient-to-r from-[#5B5FC7] to-[#7B83EB] p-4">
      <div className="flex items-center gap-4">
        {/* Teams Icon */}
        <div className="flex-shrink-0 rounded-lg bg-white/10 p-2">
          <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.19 8.77c-.73 0-1.42-.18-2.03-.49v6.53c0 2.35-1.91 4.26-4.26 4.26-2.35 0-4.26-1.91-4.26-4.26V9.9c0-.28.22-.5.5-.5h1.5c.28 0 .5.22.5.5v4.91c0 .97.79 1.76 1.76 1.76s1.76-.79 1.76-1.76V6.5c0-.28.22-.5.5-.5h1.5c.28 0 .5.22.5.5v.27c.61-.31 1.3-.49 2.03-.49 2.49 0 4.5 2.01 4.5 4.5s-2.01 4.5-4.5 4.5c-.73 0-1.42-.18-2.03-.49v1.02c.61.31 1.3.49 2.03.49 3.04 0 5.5-2.46 5.5-5.5s-2.46-5.53-5.5-5.53zM9 5.5C9 4.12 7.88 3 6.5 3S4 4.12 4 5.5 5.12 8 6.5 8 9 6.88 9 5.5zM6.5 9C4.01 9 2 11.01 2 13.5v3c0 .28.22.5.5.5H4v-4c0-.28.22-.5.5-.5h4c.28 0 .5.22.5.5v4h1.5c.28 0 .5-.22.5-.5v-3c0-2.49-2.01-4.5-4.5-4.5z" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">
            Introducing Thyme Bot for Microsoft Teams
          </h3>
          <p className="mt-0.5 text-sm text-white/80">
            Get reminders to fill in your timesheets and let AI complete them for you.
          </p>
        </div>

        {/* CTA */}
        <a
          href="https://knowall.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-[#5B5FC7] transition-colors hover:bg-white/90"
        >
          Learn More
        </a>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10"
          aria-label="Dismiss"
        >
          <XMarkIcon className="h-5 w-5 text-white/70" />
        </button>
      </div>
    </div>
  );
}
