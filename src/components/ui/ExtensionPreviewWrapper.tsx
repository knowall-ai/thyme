'use client';

import { ReactNode } from 'react';
import { ExtensionInstallModal } from './ExtensionInstallModal';
import { cn } from '@/utils';

export interface ExtensionPreviewWrapperProps {
  /** The page content to render (greyed out when extension not installed) */
  children: ReactNode;
  /** Whether the extension is not installed for this page */
  extensionNotInstalled: boolean;
  /** Name of the page for analytics/tracking (optional) */
  pageName?: string;
  /** Extra classes for the content wrapper (e.g. h-full inside a fullscreen dialog) */
  className?: string;
}

/**
 * Wrapper component that blocks page access when BC extension is not installed.
 *
 * Behavior:
 * - When extension not installed: shows modal that cannot be dismissed, content is greyed out and non-interactive
 * - When extension installed: renders children normally
 */
export function ExtensionPreviewWrapper({
  children,
  extensionNotInstalled,
  className,
}: ExtensionPreviewWrapperProps) {
  return (
    <>
      {/* Page content - greyed out and non-interactive when extension not installed */}
      <div
        className={cn(
          extensionNotInstalled && 'pointer-events-none opacity-30 grayscale select-none',
          className
        )}
      >
        {children}
      </div>

      {/* Install modal - always shown when extension not installed */}
      <ExtensionInstallModal isOpen={extensionNotInstalled} />
    </>
  );
}
