'use client';
import { useAgentName } from '@/hooks/useAgentSettingsStore';

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
import { useAgentPresence } from '@/hooks/useAgentPresence';
import {
  buildRejectionComment,
  cn,
  isOpenTimesheetReviewRequest,
  timesheetReviewRequestText,
} from '@/utils';
import { AgentAvatar, SeverityIcon, Spinner, VERDICT_TONE_CLASSES } from './AgentReviewBits';

interface AgentReviewPanelProps {
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
 * "the agent's recommendation": the AI reviewer's verdict on a submitted timesheet,
 * its summary and notes. Renders nothing when reviews aren't available (an older
 * extension) or there's nothing to show.
 */
export function AgentReviewPanel({
  result,
  variant,
  inlineLineNos,
  lineLabel,
  onUseAsRejectionComment,
  collapsible = false,
  className,
}: AgentReviewPanelProps) {
  const agentName = useAgentName();

  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();
  const { status, review, notes, verdict, submitted } = result;

  if (status === 'unavailable' || status === 'none') return null;
  // Most unsubmitted timesheets have no review, so don't flash a loading state for them
  if ((status === 'loading' || status === 'error') && !submitted) return null;

  const shell = (children: React.ReactNode) => (
    <section
      aria-label={`${agentName}'s recommendation`}
      className={cn('border-dark-700 bg-dark-850 rounded-lg border px-4 py-3', className)}
    >
      {children}
    </section>
  );

  if (status === 'loading' || status === 'error' || status === 'awaiting') {
    return shell(
      <div className="flex items-start gap-3">
        <AgentAvatar className={cn(status !== 'error' && 'animate-pulse')} />
        <div className="text-sm">
          {status === 'loading' && (
            <p className="text-dark-400">Checking for {agentName}&apos;s review…</p>
          )}
          {status === 'error' && (
            <p className="text-dark-400">Couldn&apos;t load {agentName}&apos;s review right now.</p>
          )}
          {status === 'awaiting' && (
            <>
              <p className="text-dark-200 font-medium">Awaiting {agentName}&apos;s review…</p>
              <p className="text-dark-400 text-xs">
                {variant === 'submitter'
                  ? `${agentName} checks submitted timesheets and usually reviews them within about 10 minutes.`
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
        <AgentAvatar reviewer={review.reviewer} />
        <h3 className="text-sm font-semibold text-white">{agentName}&apos;s recommendation</h3>
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
        <AskAgentAgain result={result} />
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            aria-label={isCollapsed ? `Show ${agentName}'s review` : `Hide ${agentName}'s review`}
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
                ? `This timesheet changed after ${agentName} reviewed it. ${agentName} will re-review the changes shortly.`
                : result.canRequestReview
                  ? `This timesheet changed after ${agentName} reviewed it. Ask it to look again, or it will once it’s resubmitted.`
                  : `This timesheet changed after ${agentName} reviewed it. ${agentName} will take another look once it’s resubmitted.`}
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
              {`Reviewed by ${review.reviewer || `${agentName}`} (AI)${reviewedAgo ? ` ${reviewedAgo}` : ''}.`}
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

/**
 * "Ask the agent to look again", or while it's on it, how far it's got. A failed request says
 * why and offers the button again. Hidden on extensions without review requests.
 */
function AskAgentAgain({ result }: { result: TimesheetReviewResult }) {
  const agentName = useAgentName();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { request, canRequestReview, requestReview } = result;
  const isOpen = !!request && isOpenTimesheetReviewRequest(request);
  // the agent's heartbeat: only worth reading while a request waits for it
  const presence = useAgentPresence(isOpen && request.status === 'Requested');

  if (!canRequestReview) return null;

  if (isOpen) {
    const agentOnline = presence.isAvailable ? presence.state === 'online' : undefined;
    return (
      <p className="flex items-center gap-1.5 text-xs text-purple-300" role="status">
        <Spinner />
        {timesheetReviewRequestText(agentName, request, agentOnline)}
      </p>
    );
  }

  const ask = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await requestReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't ask ${agentName} to look again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const failed = request?.status === 'Failed';
  return (
    <>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={ask}
        className="text-brand focus-visible:ring-brand rounded text-xs font-medium hover:underline focus:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {isSubmitting ? 'Asking…' : `Ask ${agentName} to look again`}
      </button>
      {error ? (
        <span className="basis-full pl-10 text-xs text-red-300" role="alert">
          {error}
        </span>
      ) : (
        failed && (
          <span className="basis-full pl-10 text-xs text-red-300" role="alert">
            {request.errorMessage || `${agentName} couldn't review this timesheet.`}
          </span>
        )
      )}
    </>
  );
}
