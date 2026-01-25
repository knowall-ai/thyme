'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useExtensionStore } from '@/hooks';
import { ExtensionInstallModal } from './ExtensionInstallModal';

export interface ExtensionPreviewWrapperProps {
  /** The page content to render (always renders, even when extension not installed) */
  children: ReactNode;
  /** Whether the extension is not installed for this page */
  extensionNotInstalled: boolean;
  /** Name of the page for analytics/tracking (optional) */
  pageName?: string;
}

/**
 * Wrapper component that shows preview of pages when BC extension is not installed.
 *
 * Behavior:
 * - Always renders children (page shows with empty data)
 * - When extension not installed + modal not dismissed: overlay + modal
 * - When extension not installed + modal dismissed: just renders children (banner shows separately)
 */
export function ExtensionPreviewWrapper({
  children,
  extensionNotInstalled,
  pageName,
}: ExtensionPreviewWrapperProps) {
  const { modalDismissed, dismissModal } = useExtensionStore();
  const [showModal, setShowModal] = useState(false);

  // Show modal when extension is not installed and modal hasn't been dismissed
  useEffect(() => {
    if (extensionNotInstalled && !modalDismissed) {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [extensionNotInstalled, modalDismissed]);

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleDismissModal = (dontShowAgain: boolean) => {
    dismissModal(dontShowAgain);
    setShowModal(false);
  };

  return (
    <>
      {/* Page content always renders */}
      <div className="relative">
        {children}

        {/* Overlay when extension not installed and modal is showing */}
        {extensionNotInstalled && showModal && (
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" aria-hidden="true" />
        )}
      </div>

      {/* Install modal */}
      <ExtensionInstallModal
        isOpen={showModal}
        onClose={handleCloseModal}
        onDismiss={handleDismissModal}
      />
    </>
  );
}
