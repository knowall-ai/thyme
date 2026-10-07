'use client';

import { useId, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  ArrowPathIcon,
  ChatBubbleLeftEllipsisIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui';
import type { TimesheetReviewResult } from '@/hooks';
import { buildRejectionComment, cn } from '@/utils';
import { PoppieAvatar, SeverityIcon, VERDICT_TONE_CLASSES } from './PoppieReviewBits';

interface PoppieReviewPanelProps {
  result: TimesheetReviewResult;
  /** 'approver' on the Approvals page, 'submitter' on the person's own Time page */
  variant: 'approver' | 'submitter';
  /** Lines whose notes are shown beside the line itself, so they're left out here */
  inlineLineNos?: ReadonlySet<number>;
  /** Names a timesheet line for notes listed in the panel (e.g. project and task) */
  lineLabel?: (timeSheetLineNo: number) => string | undefined;
  /** Pre-fills the reject reason; the action is only offered when this is set */
  onUseAsRejectionComment?: (comment: string) => void;
  /** Let the panel collapse to its header row */
  collapsible?: boolean;
  className?: string;
}

function formatReviewedAt(reviewedAt: string): string | null {
  try {
    const date = parseISO(reviewedAt);
    if (isNaN(date.getTime()) || date.getFullYear() <= 1) return null;
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return null;
  }
}

/**
 * "Poppie's recommendation": the AI reviewer's verdict on a submitted timesheet,
 * her summary and notes. Renders nothing when reviews aren't available (an older
 * extension) or there's nothing to show.
 */
export function PoppieReviewPanel({
  result,
  variant,
  inlineLineNos,
  lineLabel,
  onUseAsRejectionComment,
  collapsible = false,
  className,
}: PoppieReviewPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();
  const { status, review, notes, verdict, submitted } = result;

  if (status === 'unavailable' || status === 'none') return null;
  // Most unsubmitted timesheets have no review, so don't flash a loading state for them
  if ((status === 'loading' || status === 'error') && !submitted) return null;

  const shell = (children: React.ReactNode) => (
    <section
      aria-label="Poppie's recommendation"
      className={cn('border-dark-700 bg-dark-850 rounded-lg border px-4 py-3', className)}
    >
      {children}
    </section>
  );

  if (status === 'loading' || status === 'error' || status === 'awaiting') {
    return shell(
      <div className="flex items-start gap-3">
        <PoppieAvatar className={cn(status !== 'error' && 'animate-pulse')} />
        <div className="text-sm">
          {status === 'loading' && (
            <p className="text-dark-400">Checking for Poppie&apos;s review…</p>
          )}
          {status === 'error' && (
            <p className="text-dark-400">Couldn&apos;t load Poppie&apos;s review right now.</p>
          )}
          {status === 'awaiting' && (
            <>
              <p className="text-dark-200 font-medium">Awaiting Poppie&apos;s review…</p>
              <p className="text-dark-400 text-xs">
                {variant === 'submitter'
                  ? 'Poppie checks submitted timesheets and usually reviews them within about 10 minutes.'
                  : 'Reviews usually arrive within about 10 minutes of a timesheet being submitted.'}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // current or outOfDate: there's a review to show
  if (!review || !verdict) return null;
  const outOfDate = status === 'outOfDate';
  const reviewedAgo = formatReviewedAt(review.reviewedAt);
  const panelNotes = notes.filter(
    (note) => note.timeSheetLineNo === 0 || !inlineLineNos?.has(note.timeSheetLineNo)
  );
  const hasConcerns =
    review.verdict !== 'Approve' ||
    notes.some((note) => note.severity === 'Issue' || note.severity === 'Warning');
  const showRejectAction = !!onUseAsRejectionComment && hasConcerns;
  const isCollapsed = collapsible && collapsed;

  return shell(
    <>
      {/* Header: who, verdict, and the collapse toggle */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PoppieAvatar />
        <h3 className="text-sm font-semibold text-white">Poppie&apos;s recommendation</h3>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            VERDICT_TONE_CLASSES[verdict.tone],
            outOfDate && 'opacity-60'
          )}
        >
          {verdict.label}
        </span>
        {outOfDate && (
          <span
            className="text-dark-400 inline-flex items-center gap-1 text-xs"
            title={`Reviewed version ${review.versionStamp}; latest change ${result.currentStamp ?? 'unknown'}`}
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Out of date
          </span>
        )}
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            aria-label={isCollapsed ? "Show Poppie's review" : "Hide Poppie's review"}
            className="text-dark-400 hover:bg-dark-700 ml-auto rounded-md p-1 hover:text-white"
          >
            {isCollapsed ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronUpIcon className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div id={bodyId} className="mt-2 space-y-2 pl-10">
          {outOfDate && (
            <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
              {submitted
                ? 'This timesheet changed after Poppie reviewed it. Poppie will re-review the changes shortly.'
                : 'This timesheet changed after Poppie reviewed it. Poppie will take another look once it’s resubmitted.'}
            </p>
          )}

          {review.summary && (
            <p
              className={cn('text-dark-200 text-sm whitespace-pre-line', outOfDate && 'opacity-70')}
            >
              {review.summary}
            </p>
          )}

          {panelNotes.length > 0 && (
            <ul className={cn('space-y-1', outOfDate && 'opacity-70')}>
              {panelNotes.map((note) => {
                const label =
                  note.timeSheetLineNo > 0
                    ? (lineLabel?.(note.timeSheetLineNo) ?? `Line ${note.timeSheetLineNo}`)
                    : undefined;
                return (
                  <li key={note.id} className="text-dark-300 flex items-start gap-1.5 text-xs">
                    <SeverityIcon severity={note.severity} className="mt-px" />
                    <span>
                      {label && <span className="text-dark-200 font-medium">{label}: </span>}
                      {note.note}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-dark-500 text-xs">
              {`Reviewed by ${review.reviewer || 'Poppie'} (AI)${reviewedAgo ? ` ${reviewedAgo}` : ''}.`}
            </p>
            {showRejectAction && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onUseAsRejectionComment!(buildRejectionComment(review, notes, lineLabel))
                }
              >
                <ChatBubbleLeftEllipsisIcon className="mr-1 h-4 w-4" />
                Use as rejection comment
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
