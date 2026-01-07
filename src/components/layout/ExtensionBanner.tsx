'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { bcClient } from '@/services/bc/bcClient';

const BANNER_DISMISSED_KEY = 'thyme_extension_banner_dismissed';

export function ExtensionBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkExtension() {
      // Check if banner was previously dismissed
      const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
      if (dismissed === 'true') {
        setIsChecking(false);
        return;
      }

      try {
        const installed = await bcClient.isExtensionInstalled();
        setIsVisible(!installed);
      } catch {
        // If we can't check, don't show banner
        setIsVisible(false);
      } finally {
        setIsChecking(false);
      }
    }

    checkExtension();
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsVisible(false);
  };

  if (isChecking || !isVisible) {
    return null;
  }

  return (
    <div className="border-b border-amber-600/30 bg-amber-900/20">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-amber-200">
              <span className="font-medium">Limited functionality:</span> Install the Thyme BC
              Extension to enable customer names, project tasks, and timesheet management.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <a
              href="https://github.com/knowall-ai/thyme-bc-extension"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
            >
              Learn More
            </a>
            <button
              onClick={handleDismiss}
              className="rounded-md p-1 text-amber-400 transition-colors hover:bg-amber-800/50 hover:text-amber-200"
              aria-label="Dismiss banner"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
