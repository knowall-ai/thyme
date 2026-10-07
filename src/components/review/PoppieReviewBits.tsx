'use client';

import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { BCTimesheetReviewLine, TimesheetReviewSeverity } from '@/types';
import { cn, type VerdictTone } from '@/utils';
import type { TimesheetReviewResult } from '@/hooks';

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

/** Poppie's initial in a circle - she has no profile photo */
export function PoppieAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-xs font-semibold text-white',
        className
      )}
    >
      P
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
      <PoppieAvatar className="h-4 w-4 text-[9px]" />
      {verdict.label}
    </span>
  );
}
