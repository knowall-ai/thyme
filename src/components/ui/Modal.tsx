'use client';

import { ReactNode, RefObject, useEffect, useId, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 'full' fills the viewport (e.g. a dialog's Fullscreen toggle) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Extra classes for the overlay (e.g. print:hidden) */
  className?: string;
}

// Open modals in the order they opened, so Escape closes only the top one when a
// modal opens another (e.g. the Plan grid's edit dialog inside the Planned dialog)
const openModals: RefObject<HTMLDivElement | null>[] = [];

// Top = no open modal inside this one, and any opened since are its ancestors (a
// parent and child mounting together register child first)
function isTopModal(modal: RefObject<HTMLDivElement | null>): boolean {
  const el = modal.current;
  const index = openModals.indexOf(modal);
  return openModals.every((other, i) => {
    const otherEl = other.current;
    if (other === modal || !el || !otherEl) return true;
    if (el.contains(otherEl)) return false;
    return i < index || otherEl.contains(el);
  });
}

export function Modal({ isOpen, onClose, title, children, size = 'md', className }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Latest onClose, so a parent re-render (new callback) doesn't re-register the
  // modal and move it to the top of the stack
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    openModals.push(modalRef);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopModal(modalRef)) {
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      openModals.splice(openModals.indexOf(modalRef), 1);
      // Keep the page locked while an outer modal is still open
      if (openModals.length === 0) {
        document.body.style.overflow = 'unset';
      }
    };
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isFull = size === 'full';
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-7xl',
    full: 'flex h-full max-w-none flex-col rounded-none border-0',
  };

  return (
    <div className={cn('fixed inset-0 z-50 overflow-y-auto', className)}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className={cn('flex min-h-full items-center justify-center', isFull ? 'h-full' : 'p-4')}>
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            // No transform here: it would make this panel the containing block for a
            // nested modal's fixed positioning
            'border-dark-700 bg-dark-800 relative w-full rounded-xl border shadow-2xl transition-all',
            sizes[size]
          )}
        >
          {/* Header */}
          <div className="border-dark-700 flex shrink-0 items-center justify-between border-b px-6 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-white">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-dark-400 hover:bg-dark-700 focus:ring-knowall-green rounded-lg p-1 hover:text-white focus:ring-2 focus:outline-none"
            >
              <XMarkIcon className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {/* Content */}
          <div className={cn('px-6 py-4', isFull && 'min-h-0 flex-1 overflow-auto')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
