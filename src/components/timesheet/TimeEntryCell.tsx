'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { TimeEntry, Project, BCTimesheetReviewLine } from '@/types';
import {
  cn,
  describeBillableSplit,
  formatBillablePercent,
  formatDateForDisplay,
  formatTime,
  getBillableSplit,
  worstSeverity,
} from '@/utils';
import type { BillableTarget } from '@/utils';
import { SeverityIcon } from '@/components/review';
import { BillableTargetBadge } from '@/components/targets';
import { TimeEntryDetailsPopover, describeEntry } from './TimeEntryDetails';

const DRAG_MIME_TYPE = 'application/x-timmie-entry-id';

/** How long the pointer rests on an entry before its details show, so sweeping across the
 *  grid doesn't flash popovers; and the grace period to move onto the popover itself */
export const ENTRY_DETAILS_HOVER_DELAY_MS = 300;
const ENTRY_DETAILS_CLOSE_DELAY_MS = 120;

/** Why an entry's details are showing: a resting pointer, keyboard focus, or a click/tap
 *  (read-only) that keeps them open until clicked again, Escape or focus moves away */
type DetailsOpenReason = 'hover' | 'focus' | 'pinned';

interface TimeEntryCardProps {
  entry: TimeEntry;
  projects: Project[];
  readOnly: boolean;
  draggable: boolean;
  reviewNotes?: BCTimesheetReviewLine[];
  onEdit: (entry: TimeEntry) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, entry: TimeEntry) => void;
}

/**
 * One entry in a day. Resting the pointer on it or focusing it shows its full details in a
 * popover. Editable entries open the edit form on click/Enter; read-only ones (a teammate's
 * or a submitted week) toggle the details instead, which is how touch screens see them.
 */
function TimeEntryCard({
  entry,
  projects,
  readOnly,
  draggable,
  reviewNotes,
  onEdit,
  onDragStart,
}: TimeEntryCardProps) {
  const [openReason, setOpenReason] = useState<DetailsOpenReason | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();
  const isOpen = openReason !== null && !isDragging;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const close = () => {
    clearTimer();
    setOpenReason(null);
  };
  const togglePinned = () => {
    clearTimer();
    setOpenReason((reason) => (reason === 'pinned' ? null : 'pinned'));
  };

  // No timer outlives the card
  useEffect(() => {
    const timers = timerRef;
    return () => {
      if (timers.current) clearTimeout(timers.current);
    };
  }, []);

  // Escape closes it wherever focus is (it may be open from hover alone)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setOpenReason(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleMouseEnter = () => {
    clearTimer();
    if (openReason || isDragging) return;
    // Never replaces a click or focus that got there first (a tap fires mouseenter too)
    timerRef.current = setTimeout(
      () => setOpenReason((reason) => reason ?? 'hover'),
      ENTRY_DETAILS_HOVER_DELAY_MS
    );
  };
  const handleMouseLeave = () => {
    clearTimer();
    if (openReason === 'hover') {
      timerRef.current = setTimeout(() => setOpenReason(null), ENTRY_DETAILS_CLOSE_DELAY_MS);
    }
  };

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    // Keyboard focus only: a click's focus is handled by onClick
    if (isDragging || !e.currentTarget.matches(':focus-visible')) return;
    clearTimer();
    // Focus takes over from hover, so moving the mouse away doesn't close it while focused
    setOpenReason((reason) => (reason === 'pinned' ? 'pinned' : 'focus'));
  };
  const handleBlur = (e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (
      next &&
      (cardRef.current?.contains(next) || document.getElementById(popoverId)?.contains(next))
    ) {
      return;
    }
    if (openReason !== 'hover') close();
  };

  const handleClick = () => {
    if (readOnly) {
      togglePinned();
    } else {
      close();
      onEdit(entry);
    }
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (readOnly) {
      // Keyboard focus has usually shown it already: Enter keeps it, then hides it
      togglePinned();
    } else {
      close();
      onEdit(entry);
    }
  };

  const { projectName, color } = describeEntry(entry, projects);
  const reviewSeverity = reviewNotes ? worstSeverity(reviewNotes) : null;
  const summary = `${projectName}, ${formatTime(entry.hours)}, ${formatDateForDisplay(entry.date)}`;

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        role="button"
        tabIndex={0}
        aria-label={readOnly ? `${summary}. Show details` : `Edit ${summary}`}
        aria-describedby={isOpen ? popoverId : undefined}
        aria-expanded={readOnly ? isOpen : undefined}
        aria-controls={readOnly && isOpen ? popoverId : undefined}
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                close();
                setIsDragging(true);
                onDragStart(e, entry);
              }
            : undefined
        }
        onDragEnd={draggable ? () => setIsDragging(false) : undefined}
        className={cn(
          'w-full cursor-pointer rounded-md p-2 text-left transition-colors',
          'focus-visible:ring-timmie-500 focus-visible:ring-2 focus-visible:outline-none',
          !readOnly && 'hover:bg-dark-600/50',
          draggable && 'cursor-grab active:cursor-grabbing',
          // Flag entries Poppie commented on
          reviewSeverity === 'Issue' && 'ring-1 ring-red-400/70',
          reviewSeverity === 'Warning' && 'ring-1 ring-amber-400/70',
          reviewSeverity === 'Info' && 'ring-1 ring-blue-400/50'
        )}
        style={{
          backgroundColor: `${color}20`,
          borderLeft: `3px solid ${color}`,
        }}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-dark-200 flex min-w-0 items-center gap-1 text-xs font-medium">
            {reviewSeverity && <SeverityIcon severity={reviewSeverity} className="h-3.5 w-3.5" />}
            <span className="truncate">{projectName}</span>
          </span>
          <span className="text-dark-400 shrink-0 text-xs">{formatTime(entry.hours)}</span>
        </div>
        {entry.notes && <p className="text-dark-400 mt-0.5 truncate text-xs">{entry.notes}</p>}
      </div>
      {isOpen && (
        <TimeEntryDetailsPopover
          id={popoverId}
          entry={entry}
          projects={projects}
          reviewNotes={reviewNotes}
          anchorRef={cardRef}
          onMouseEnter={clearTimer}
          onMouseLeave={handleMouseLeave}
          onBlur={handleBlur}
        />
      )}
    </>
  );
}

interface TimeEntryCellProps {
  entries: TimeEntry[];
  date: string;
  isToday: boolean;
  projects: Project[];
  onAddEntry: (date: string) => void;
  onEditEntry: (entry: TimeEntry) => void;
  onMoveEntry?: (entryId: string, newDate: string) => void;
  readOnly?: boolean;
  /** Poppie's review notes by timesheet line number, to flag the entries they refer to */
  reviewNotesByLine?: Map<number, BCTimesheetReviewLine[]>;
  /** The person's billable target; the day's billable % is coloured against it when set */
  billableTarget?: BillableTarget | null;
}

export function TimeEntryCell({
  entries,
  date,
  isToday,
  projects,
  onAddEntry,
  onEditEntry,
  onMoveEntry,
  readOnly = false,
  reviewNotesByLine,
  billableTarget,
}: TimeEntryCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  // Same billable rule as Team and Reports: each entry's isBillable comes from isBillableEntry
  const billable = getBillableSplit(entries);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, entry: TimeEntry) => {
    e.dataTransfer.setData(DRAG_MIME_TYPE, entry.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly || !onMoveEntry) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the cell entirely, not when crossing child elements
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly || !onMoveEntry) return;
    const entryId = e.dataTransfer.getData(DRAG_MIME_TYPE);
    setIsDragOver(false);
    if (!entryId) return;
    onMoveEntry(entryId, date);
  };

  return (
    <div
      className={cn(
        // Flex column so the day total can sit at the bottom, level across the week
        'border-dark-700 flex min-h-[100px] flex-col border-r p-2 transition-colors last:border-r-0 sm:min-h-[120px]',
        isToday ? 'bg-brand/5' : 'bg-dark-800',
        isHovered && !isDragOver && 'bg-dark-700/50',
        isDragOver && 'ring-brand/60 bg-brand/10 ring-2 ring-inset'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => (
          <TimeEntryCard
            key={entry.id}
            entry={entry}
            projects={projects}
            readOnly={readOnly}
            draggable={!readOnly && !!onMoveEntry}
            reviewNotes={
              entry.bcTimeSheetLineNo !== undefined
                ? reviewNotesByLine?.get(entry.bcTimeSheetLineNo)
                : undefined
            }
            onEdit={onEditEntry}
            onDragStart={handleDragStart}
          />
        ))}
      </div>

      {/* Add button - always visible when not in read-only mode */}
      {!readOnly && (
        <button
          onClick={() => onAddEntry(date)}
          className={cn(
            'border-dark-600 text-dark-500 mt-2 w-full rounded-md border-2 border-dashed p-2',
            'hover:border-brand hover:bg-brand/10 hover:text-brand transition-colors',
            'flex items-center justify-center gap-1 text-xs'
          )}
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add</span>
        </button>
      )}

      {/* Day total - pinned to the bottom so every day's total lines up */}
      {totalHours > 0 && (
        <div className="mt-auto pt-2">
          <div className="border-dark-700 border-t pt-2">
            <p className="text-dark-300 text-right text-xs font-medium">{formatTime(totalHours)}</p>
            {billable.totalHours > 0 && billableTarget && (
              <div className="mt-1 flex justify-end">
                <BillableTargetBadge
                  actualPercent={billable.billablePercent}
                  target={billableTarget}
                  hasHours
                  compact
                  className="px-1.5 text-[11px] leading-tight"
                />
              </div>
            )}
            {billable.totalHours > 0 && !billableTarget && (
              <p
                className="text-dark-500 text-right text-[11px] leading-tight whitespace-nowrap"
                title={describeBillableSplit(billable)}
                aria-label={describeBillableSplit(billable)}
              >
                {formatBillablePercent(billable)}
                <span className="hidden lg:inline"> billable</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
