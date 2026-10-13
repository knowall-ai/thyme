'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { BCTimesheetReviewLine, TimesheetReviewSeverity } from '@/types';
import { cn, computePopoverPosition, type VerdictTone } from '@/utils';
import type { TimesheetReviewResult } from '@/hooks';
import { useReviewerPhoto } from '@/services/auth/reviewerIdentity';

export const VERDICT_TONE_CLASSES: Record<VerdictTone, string> = {
  green: 'bg-thyme-500/20 text-thyme-400',
  amber: 'bg-amber-500/20 text-amber-400',
  red: 'bg-red-500/20 text-red-400',
};

const SEVERITY_STYLES: Record<
  TimesheetReviewSeverity,
  { icon: typeof InformationCircleIcon; className: string; label: string }
> = {
  Issue: { icon: ExclamationCircleIcon, className: 'text-red-400', label: 'Issue' },
  Warning: { icon: ExclamationTriangleIcon, className: 'text-amber-400', label: 'Warning' },
  Info: { icon: InformationCircleIcon, className: 'text-blue-400', label: 'Note' },
};

export function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity as TimesheetReviewSeverity] ?? SEVERITY_STYLES.Info;
}

/**
 * The AI reviewer's avatar: their Microsoft 365 profile photo when the reviewer name resolves to
 * exactly one directory user, otherwise their initial in a circle.
 */
export function PoppieAvatar({
  reviewer,
  className,
}: {
  reviewer?: string | null;
  className?: string;
}) {
  const name = reviewer?.trim() || 'Poppie';
  const photoUrl = useReviewerPhoto(reviewer);
  const shape = 'inline-flex h-7 w-7 shrink-0 rounded-full';

  if (photoUrl) {
    return (
      <img src={photoUrl} alt={`${name} (AI)`} className={cn(shape, 'object-cover', className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        shape,
        'items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-500 text-xs font-semibold text-white',
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function SeverityIcon({ severity, className }: { severity: string; className?: string }) {
  const style = getSeverityStyle(severity);
  const Icon = style.icon;
  return (
    <Icon
      className={cn('h-4 w-4 shrink-0', style.className, className)}
      aria-label={style.label}
      role="img"
    />
  );
}

/** Poppie's notes for one timesheet line, shown next to that line */
export function PoppieLineNotes({
  notes,
  className,
}: {
  notes: BCTimesheetReviewLine[] | undefined;
  className?: string;
}) {
  if (!notes || notes.length === 0) return null;
  return (
    <ul className={cn('mt-1 space-y-0.5', className)} aria-label="Poppie's notes on this line">
      {notes.map((note) => (
        <li key={note.id} className="text-dark-300 flex items-start gap-1.5 text-xs">
          <SeverityIcon severity={note.severity} className="mt-px h-3.5 w-3.5" />
          <span>{note.note}</span>
        </li>
      ))}
    </ul>
  );
}

const SEVERITY_RANK: Record<TimesheetReviewSeverity, number> = { Issue: 2, Warning: 1, Info: 0 };

/**
 * Poppie's notes for one timesheet line as a compact icon, marked with the most serious note's
 * severity, that opens the notes in a popover on hover, focus or click (for touch).
 */
export function PoppieLineNotesPopover({
  notes,
  reviewer,
  className,
}: {
  notes: BCTimesheetReviewLine[] | undefined;
  reviewer?: string | null;
  className?: string;
}) {
  // Hover or focus peeks at the notes and a click pins them open. Clicking a pinned popover or
  // pressing Escape dismisses it until the pointer leaves or focus moves on.
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  if (!notes || notes.length === 0) return null;

  const worst = notes.reduce((a, b) =>
    (SEVERITY_RANK[b.severity] ?? 0) > (SEVERITY_RANK[a.severity] ?? 0) ? b : a
  );
  const isOpen = isPinned || (isHovered && !isDismissed);
  const name = reviewer?.trim() || 'Poppie';
  const dismiss = () => {
    setIsPinned(false);
    setIsDismissed(true);
  };
  const reset = () => {
    setIsHovered(false);
    setIsPinned(false);
    setIsDismissed(false);
  };

  return (
    <span className={cn('inline-flex', className)}>
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsDismissed(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isPinned) dismiss();
          else {
            setIsPinned(true);
            setIsDismissed(false);
          }
        }}
        onFocus={() => setIsHovered(true)}
        onBlur={reset}
        onKeyDown={(e) => {
          if (e.key === 'Escape') dismiss();
        }}
        aria-label={`${name}'s ${notes.length === 1 ? 'note' : `${notes.length} notes`} on this entry`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? popoverId : undefined}
        className="hover:bg-dark-700 inline-flex items-center gap-0.5 rounded-md p-1"
      >
        <SeverityIcon severity={worst.severity} />
        {notes.length > 1 && (
          <span className="text-dark-300 text-[10px] font-medium tabular-nums">{notes.length}</span>
        )}
      </button>
      {isOpen && (
        <FloatingPopover id={popoverId} anchorRef={buttonRef}>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-white">
            <PoppieAvatar reviewer={reviewer} className="h-5 w-5 text-[9px]" />
            {name}&apos;s {notes.length === 1 ? 'note' : 'notes'}
          </p>
          <PoppieLineNotes notes={notes} className="mt-0 space-y-1.5" />
        </FloatingPopover>
      )}
    </span>
  );
}

/**
 * A popover rendered into the document body, so cards that clip their overflow don't cut it
 * off, and kept on screen next to its anchor as the page scrolls or resizes.
 */
function FloatingPopover({
  id,
  anchorRef,
  children,
}: {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const { top, left } = computePopoverPosition(
      anchor.getBoundingClientRect(),
      { width: popover.offsetWidth, height: popover.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    setPosition({ top, left });
  }, [anchorRef]);

  // Measure before paint so it never shows in the wrong place
  useLayoutEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      role="tooltip"
      className="border-dark-600 bg-dark-800 fixed z-50 max-h-[calc(100vh-16px)] w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border p-3 shadow-lg"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/**
 * A compact verdict chip for a card header, so the recommendation shows without
 * expanding the card. Renders nothing until there's a review.
 */
export function PoppieVerdictChip({ result }: { result: TimesheetReviewResult }) {
  const { status, verdict } = result;
  if (!verdict || (status !== 'current' && status !== 'outOfDate')) return null;
  const outOfDate = status === 'outOfDate';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        VERDICT_TONE_CLASSES[verdict.tone],
        outOfDate && 'opacity-60'
      )}
      title={
        outOfDate
          ? `Poppie: ${verdict.label} (out of date - the timesheet changed after her review)`
          : `Poppie: ${verdict.label}`
      }
    >
      <PoppieAvatar reviewer={result.review?.reviewer} className="h-4 w-4 text-[9px]" />
      {verdict.label}
    </span>
  );
}
