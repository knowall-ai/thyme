'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { BCTimesheetReviewLine, Project, TimeEntry } from '@/types';
import {
  cn,
  computePopoverPosition,
  formatDateForDisplay,
  formatTime,
  TIMESHEET_STATUS_COLORS,
} from '@/utils';
import { PoppieLineNotes } from '@/components/review';

// Re-exported from its old home, where its tests import it (the Plan's day notes popover
// uses it from @/utils too)
export { computePopoverPosition };

/** Lookups for an entry's project and task, shared by the card and its popover */
export function describeEntry(entry: TimeEntry, projects: Project[]) {
  // projectId is the job code (e.g. "PR00030") and taskId the job task code
  const project = projects.find((p) => p.code === entry.projectId);
  const task = project?.tasks.find((t) => t.code === entry.taskId);
  return {
    project,
    projectName: project?.name || 'Unknown',
    color: project?.color || '#9ca3af',
    taskName: task?.name,
  };
}

interface TimeEntryDetailsPopoverProps {
  id: string;
  entry: TimeEntry;
  projects: Project[];
  reviewNotes?: BCTimesheetReviewLine[];
  anchorRef: RefObject<HTMLElement | null>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
}

/**
 * The full details of a timesheet entry, shown over the week grid. Rendered into the
 * document body (the grid clips its overflow) and positioned against the entry's card.
 */
export function TimeEntryDetailsPopover({
  id,
  entry,
  projects,
  reviewNotes,
  anchorRef,
  onMouseEnter,
  onMouseLeave,
  onBlur,
}: TimeEntryDetailsPopoverProps) {
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

  // Measure before paint so it never shows in the wrong place, and follow the card on
  // scroll (of the page or any scrolling parent) and resize
  useLayoutEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  const { project, projectName, color, taskName } = describeEntry(entry, projects);
  const status = entry.lineStatus;

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onBlur={onBlur}
      // Focusable (not in the tab order) so clicking in it, to scroll or select text,
      // doesn't count as leaving the entry
      tabIndex={-1}
      className="bg-dark-800 border-dark-600 fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-lg border p-3 text-left shadow-xl focus:outline-none"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
        borderTop: `3px solid ${color}`,
      }}
    >
      <p className="text-sm font-semibold break-words text-white">{projectName}</p>
      <p className="text-dark-400 text-xs">
        <span className="font-mono">{entry.projectId}</span>
        {project?.customerName && <span> · {project.customerName}</span>}
      </p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-dark-400">Task</dt>
        <dd className="text-dark-200 break-words">
          {taskName ? (
            <>
              {taskName} <span className="text-dark-500 font-mono">({entry.taskId})</span>
            </>
          ) : (
            <span className="font-mono">{entry.taskId || '-'}</span>
          )}
        </dd>
        <dt className="text-dark-400">Date</dt>
        <dd className="text-dark-200">{formatDateForDisplay(entry.date)}</dd>
        <dt className="text-dark-400">Hours</dt>
        <dd className="text-dark-200">{formatTime(entry.hours)}</dd>
      </dl>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {status && (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium',
              TIMESHEET_STATUS_COLORS[status]
            )}
          >
            {status}
          </span>
        )}
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-medium',
            entry.isBillable ? 'bg-timmie-500/20 text-timmie-400' : 'bg-dark-600 text-dark-300'
          )}
        >
          {entry.isBillable ? 'Billable' : 'Non-billable'}
        </span>
      </div>

      <div className="border-dark-700 mt-2 border-t pt-2">
        {entry.notes ? (
          <p className="text-dark-200 max-h-48 overflow-y-auto text-xs break-words whitespace-pre-wrap">
            {entry.notes}
          </p>
        ) : (
          <p className="text-dark-500 text-xs italic">No description</p>
        )}
      </div>

      {reviewNotes && reviewNotes.length > 0 && (
        <div className="border-dark-700 mt-2 border-t pt-2">
          <p className="text-dark-400 text-[11px] font-medium tracking-wide uppercase">Poppie</p>
          <PoppieLineNotes notes={reviewNotes} />
        </div>
      )}
    </div>,
    document.body
  );
}
