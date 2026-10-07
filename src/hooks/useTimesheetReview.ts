import { useEffect, useMemo } from 'react';
import type { BCTimesheetReview, BCTimesheetReviewLine } from '@/types';
import {
  computeVersionStamp,
  getReviewStatus,
  getVerdictDisplay,
  groupNotesByLine,
  latestStamp,
  needsReviewRefresh,
  sortNotes,
  type TimesheetReviewStatus,
  type VerdictDisplay,
} from '@/utils';
import { useTimesheetReviewStore, watchTimesheetReview } from './useTimesheetReviewStore';

type Stamped = ReadonlyArray<{ lastModifiedDateTime?: string }>;

export interface UseTimesheetReviewOptions {
  /** Whether the timesheet is submitted (awaiting approval) */
  submitted: boolean;
  /** A known version stamp to compare too, e.g. the time of a local edit */
  versionStamp?: string | null;
  /** Set false to skip fetching (e.g. a read-only teammate view) */
  enabled?: boolean;
  /**
   * Whether every timestamp source has loaded (e.g. false while details are still
   * loading). Until then a review isn't reported as current, since a later timestamp
   * may still turn up; out of date is already certain from what has loaded.
   */
  versionReady?: boolean;
}

export interface TimesheetReviewResult {
  status: TimesheetReviewStatus;
  review: BCTimesheetReview | null;
  /** All notes, most severe first */
  notes: BCTimesheetReviewLine[];
  /** Notes keyed by timesheet line number (0 = the whole timesheet) */
  notesByLine: Map<number, BCTimesheetReviewLine[]>;
  verdict: VerdictDisplay | null;
  submitted: boolean;
  /** The timesheet's latest change as known here, compared with the review's versionStamp */
  currentStamp: string | null;
}

/**
 * Poppie's latest review of a timesheet, and whether it still matches the timesheet.
 *
 * `lines` and `details` are the timesheet's records as loaded: the latest of their
 * lastModifiedDateTime values is compared with the review's versionStamp to tell when
 * the timesheet has changed since Poppie looked. Reviews are fetched in batches across
 * every timesheet on screen and re-checked while any of them is waiting on Poppie.
 */
export function useTimesheetReview(
  timeSheetNo: string | null | undefined,
  lines: Stamped | undefined,
  details: Stamped | undefined,
  { submitted, versionStamp, enabled = true, versionReady = true }: UseTimesheetReviewOptions
): TimesheetReviewResult {
  const available = useTimesheetReviewStore((s) => s.available);
  const cached = useTimesheetReviewStore((s) => (timeSheetNo ? s.reviews[timeSheetNo] : undefined));
  const failed = useTimesheetReviewStore((s) => (timeSheetNo ? !!s.failed[timeSheetNo] : false));
  const requestReviews = useTimesheetReviewStore((s) => s.requestReviews);

  const active = enabled && !!timeSheetNo && available !== false;
  const isCached = !!cached;

  const currentStamp = useMemo(
    () => latestStamp(computeVersionStamp(lines, details), versionStamp),
    [lines, details, versionStamp]
  );

  const fetchedStatus: TimesheetReviewStatus = !active
    ? available === false
      ? 'unavailable'
      : 'none'
    : getReviewStatus({
        available,
        fetched: isCached,
        failed,
        review: cached?.review,
        submitted,
        currentStamp,
      });
  const status: TimesheetReviewStatus =
    fetchedStatus === 'current' && !versionReady ? 'loading' : fetchedStatus;
  const awaiting = needsReviewRefresh(status, submitted);

  // Fetch on first view (and again after a company switch clears the cache)
  useEffect(() => {
    if (active && timeSheetNo && !isCached) requestReviews([timeSheetNo]);
  }, [active, timeSheetNo, isCached, requestReviews]);

  // Join the shared focus/interval refresh while on screen
  useEffect(() => {
    if (!active || !timeSheetNo) return;
    return watchTimesheetReview(timeSheetNo, awaiting);
  }, [active, timeSheetNo, awaiting]);

  const review = active ? (cached?.review ?? null) : null;
  const notes = useMemo(() => sortNotes(review ? (cached?.notes ?? []) : []), [review, cached]);
  const notesByLine = useMemo(() => groupNotesByLine(notes), [notes]);

  return {
    status,
    review,
    notes,
    notesByLine,
    verdict: review ? getVerdictDisplay(review.verdict) : null,
    submitted,
    currentStamp,
  };
}
