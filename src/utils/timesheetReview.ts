import type {
  BCTimesheetReview,
  BCTimesheetReviewLine,
  TimesheetReviewSeverity,
  TimesheetReviewVerdict,
} from '@/types';

/**
 * Where a timesheet's review stands, as shown in Poppie's panel.
 * - unavailable: the review endpoints don't exist (extension too old) - hide the panel
 * - loading: first fetch still in flight
 * - error: the fetch failed and nothing is cached
 * - awaiting: submitted, but Poppie hasn't reviewed it yet
 * - none: not submitted and never reviewed - nothing to show
 * - outOfDate: the timesheet changed after Poppie's review
 * - current: the review matches the timesheet as it is now
 */
export type TimesheetReviewStatus =
  | 'unavailable'
  | 'loading'
  | 'error'
  | 'awaiting'
  | 'none'
  | 'outOfDate'
  | 'current';

export type VerdictTone = 'green' | 'amber' | 'red';

export interface VerdictDisplay {
  label: string;
  tone: VerdictTone;
}

const VERDICT_DISPLAY: Record<TimesheetReviewVerdict, VerdictDisplay> = {
  Approve: { label: 'Looks good', tone: 'green' },
  Check: { label: 'Worth a check', tone: 'amber' },
  Query: { label: 'Query before approving', tone: 'red' },
};

/**
 * Chip label and colour for a verdict. An unrecognised verdict (e.g. a newer
 * extension adding one) reads as "Worth a check" rather than a false all-clear.
 */
export function getVerdictDisplay(verdict: string): VerdictDisplay {
  return VERDICT_DISPLAY[verdict as TimesheetReviewVerdict] ?? VERDICT_DISPLAY.Check;
}

const SEVERITY_RANK: Record<TimesheetReviewSeverity, number> = { Issue: 0, Warning: 1, Info: 2 };

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity as TimesheetReviewSeverity] ?? SEVERITY_RANK.Info;
}

// Epoch ms for a BC timestamp, or null for blanks and BC's 0001-01-01 placeholder
function toTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time) || new Date(time).getUTCFullYear() <= 1) return null;
  return time;
}

/**
 * The timesheet's version stamp: the latest lastModifiedDateTime across its lines and
 * details, the same value Poppie records on a review. Null when nothing has a timestamp.
 */
export function computeVersionStamp(
  ...sources: Array<ReadonlyArray<{ lastModifiedDateTime?: string }> | undefined>
): string | null {
  let latest: number | null = null;
  let latestValue: string | null = null;
  for (const records of sources) {
    for (const record of records ?? []) {
      const time = toTime(record.lastModifiedDateTime);
      if (time !== null && (latest === null || time > latest)) {
        latest = time;
        latestValue = record.lastModifiedDateTime!;
      }
    }
  }
  return latestValue;
}

/** The later of two version stamps (either may be missing). */
export function latestStamp(a: string | null | undefined, b: string | null | undefined) {
  const timeA = toTime(a);
  const timeB = toTime(b);
  if (timeA === null) return timeB === null ? null : b!;
  if (timeB === null) return a!;
  return timeB > timeA ? b! : a!;
}

/**
 * A review is out of date when the timesheet has changed since the version Poppie saw.
 * Unknown timestamps count as unchanged, so a missing value never hides a review.
 */
export function isReviewOutOfDate(
  review: Pick<BCTimesheetReview, 'versionStamp'>,
  currentStamp: string | null | undefined
): boolean {
  const reviewed = toTime(review.versionStamp);
  const current = toTime(currentStamp);
  return reviewed !== null && current !== null && current > reviewed;
}

/** The newest review per timesheet, from reviews for any number of timesheets. */
export function pickLatestReviews(reviews: BCTimesheetReview[]): Record<string, BCTimesheetReview> {
  const latest: Record<string, BCTimesheetReview> = {};
  for (const review of reviews) {
    const current = latest[review.timeSheetNo];
    if (!current) {
      latest[review.timeSheetNo] = review;
      continue;
    }
    const time = toTime(review.reviewedAt) ?? 0;
    const currentTime = toTime(current.reviewedAt) ?? 0;
    // Same instant: the later entry was written last
    if (time > currentTime || (time === currentTime && review.entryNo > current.entryNo)) {
      latest[review.timeSheetNo] = review;
    }
  }
  return latest;
}

/** Notes sorted most severe first, then in Poppie's order. */
export function sortNotes(notes: BCTimesheetReviewLine[]): BCTimesheetReviewLine[] {
  return [...notes].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.lineNo - b.lineNo
  );
}

/** Notes grouped by the timesheet line they refer to (0 = the whole timesheet). */
export function groupNotesByLine(
  notes: BCTimesheetReviewLine[]
): Map<number, BCTimesheetReviewLine[]> {
  const byLine = new Map<number, BCTimesheetReviewLine[]>();
  for (const note of sortNotes(notes)) {
    const list = byLine.get(note.timeSheetLineNo) ?? [];
    list.push(note);
    byLine.set(note.timeSheetLineNo, list);
  }
  return byLine;
}

/** The most severe severity among some notes, or null for none. */
export function worstSeverity(notes: BCTimesheetReviewLine[]): TimesheetReviewSeverity | null {
  if (notes.length === 0) return null;
  return sortNotes(notes)[0].severity;
}

export function getReviewStatus({
  available,
  fetched,
  failed,
  review,
  submitted,
  currentStamp,
}: {
  /** Whether the review endpoints exist (null = not known yet) */
  available: boolean | null;
  /** Whether this timesheet's reviews have been fetched at least once */
  fetched: boolean;
  /** Whether the last fetch failed */
  failed?: boolean;
  review: BCTimesheetReview | null | undefined;
  submitted: boolean;
  currentStamp: string | null | undefined;
}): TimesheetReviewStatus {
  if (available === false) return 'unavailable';
  if (!fetched) return failed ? 'error' : 'loading';
  if (!review) return submitted ? 'awaiting' : 'none';
  return isReviewOutOfDate(review, currentStamp) ? 'outOfDate' : 'current';
}

/**
 * Whether a timesheet in this state should keep being re-checked: it's waiting on
 * Poppie's first review or on a re-review of changes that have been resubmitted,
 * or its first fetch failed and should be retried.
 */
export function needsReviewRefresh(status: TimesheetReviewStatus, submitted: boolean): boolean {
  return submitted && (status === 'awaiting' || status === 'outOfDate' || status === 'error');
}

/**
 * A rejection comment built from Poppie's review: the summary, then the Issue and
 * Warning notes (most severe first). Info notes are left out - they aren't reasons to reject.
 */
export function buildRejectionComment(
  review: Pick<BCTimesheetReview, 'summary'>,
  notes: BCTimesheetReviewLine[],
  lineLabel?: (timeSheetLineNo: number) => string | undefined
): string {
  const points = sortNotes(notes)
    .filter((note) => note.severity === 'Issue' || note.severity === 'Warning')
    .map((note) => {
      const label =
        note.timeSheetLineNo > 0
          ? (lineLabel?.(note.timeSheetLineNo) ?? `Line ${note.timeSheetLineNo}`)
          : undefined;
      return `- ${label ? `${label}: ` : ''}${note.note.trim()}`;
    });
  return [review.summary.trim(), points.join('\n')].filter(Boolean).join('\n\n');
}
