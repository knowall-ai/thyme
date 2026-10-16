'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, isSameYear } from 'date-fns';
import { formatHours } from '@/utils';
import { sumPlannedHours, type PlannedDays, type PlannedHours } from '@/hooks/usePlanStore';

// Same width as before, so the grid's day columns keep theirs
const CELL_CLASS = 'text-dark-300 w-16 shrink-0 px-2 text-right text-sm';
const NOTE_WIDTH = 240;
// Long enough to move the pointer from the cell onto the note, so it can be read there
const HIDE_DELAY_MS = 200;

interface PlanTotalCellProps {
  /** Hours planned in the weeks in view */
  hours: number;
  /** Hours planned by date in every week; without them the cell is just the number */
  plannedDays?: PlannedDays;
  /** First and last days in view */
  from: Date;
  to: Date;
  /** A person's total is across every project on the Plan */
  isPerson?: boolean;
}

interface OpenNote {
  top: number;
  left: number;
  /** Worked out as it opens, so "from today" is today's even on a Plan left open overnight */
  planned: PlannedHours;
}

const formatRange = (from: Date, to: Date) =>
  `${format(from, isSameYear(from, to) ? 'd MMM' : 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;

/**
 * A row's In view total, with a note on hover or focus of what's planned beyond the weeks in
 * view: from today on, and in every week. The note is portalled, so the grid's scrolling
 * doesn't clip it, and stays open while the pointer is on it.
 */
export function PlanTotalCell({
  hours,
  plannedDays,
  from,
  to,
  isPerson = false,
}: PlanTotalCellProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteId = useId();
  const [note, setNote] = useState<OpenNote | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const hide = useCallback(() => {
    cancelHide();
    setNote(null);
  }, [cancelHide]);
  const hideSoon = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(hide, HIDE_DELAY_MS);
  }, [cancelHide, hide]);

  const show = useCallback(() => {
    cancelHide();
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect || !plannedDays) return;
    // Below the cell, right edges lined up; above it when there's no room below
    const below = rect.bottom + 6;
    const top = below + 140 > window.innerHeight ? Math.max(8, rect.top - 146) : below;
    const left = Math.max(8, Math.min(rect.right - NOTE_WIDTH, window.innerWidth - NOTE_WIDTH - 8));
    setNote({ top, left, planned: sumPlannedHours(plannedDays, format(new Date(), 'yyyy-MM-dd')) });
  }, [cancelHide, plannedDays]);

  // A fixed note would drift from its cell on scroll, and Escape dismisses it
  useEffect(() => {
    if (!note) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [note, hide]);

  useEffect(() => cancelHide, [cancelHide]);

  const inView = hours > 0 ? `${formatHours(hours)}h` : '';
  if (!plannedDays) return <div className={CELL_CLASS}>{inView}</div>;

  const rows: [string, number][] = note
    ? [
        [`In view · ${formatRange(from, to)}`, hours],
        ['From today', note.planned.fromToday],
        ['All weeks', note.planned.all],
      ]
    : [];

  return (
    <div className="w-16 shrink-0 self-stretch">
      <button
        ref={anchorRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hide}
        aria-label={`${formatHours(hours)}h planned in view`}
        aria-describedby={note ? noteId : undefined}
        className="text-dark-300 hover:text-dark-100 focus-visible:ring-knowall-green h-full w-full px-2 text-right text-sm focus:outline-none focus-visible:ring-1"
      >
        {inView}
      </button>
      {note &&
        createPortal(
          <div
            id={noteId}
            role="tooltip"
            onMouseEnter={cancelHide}
            onMouseLeave={hideSoon}
            className="bg-dark-800 border-dark-600 fixed z-[60] rounded-lg border p-3 text-xs shadow-xl"
            style={{ top: note.top, left: note.left, width: NOTE_WIDTH }}
          >
            <p className="mb-2 font-medium text-white">Planned hours</p>
            <dl className="space-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-dark-400">{label}</dt>
                  <dd className="text-white tabular-nums">{formatHours(value)}h</dd>
                </div>
              ))}
            </dl>
            {isPerson && (
              <p className="text-dark-400 border-dark-600 mt-2 border-t pt-2">
                Across every project on the Plan.
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
