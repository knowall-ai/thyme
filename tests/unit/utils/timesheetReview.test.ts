import { describe, it, expect } from 'vitest';
import type { BCTimesheetReview, BCTimesheetReviewLine } from '@/types';
import {
  buildRejectionComment,
  computeVersionStamp,
  getReviewStatus,
  getVerdictDisplay,
  groupNotesByLine,
  isReviewOutOfDate,
  latestStamp,
  needsReviewRefresh,
  pickLatestReviews,
  worstSeverity,
} from '@/utils/timesheetReview';

const review = (overrides: Partial<BCTimesheetReview> = {}): BCTimesheetReview => ({
  id: 'r1',
  entryNo: 1,
  timeSheetNo: 'TS0001',
  versionStamp: '2026-10-05T09:00:00Z',
  verdict: 'Approve',
  summary: 'All hours line up with the calendar.',
  reviewer: 'Poppie',
  reviewedAt: '2026-10-05T09:10:00Z',
  ...overrides,
});

const note = (overrides: Partial<BCTimesheetReviewLine> = {}): BCTimesheetReviewLine => ({
  id: `n${overrides.lineNo ?? 1}`,
  reviewEntryNo: 1,
  lineNo: 1,
  timeSheetNo: 'TS0001',
  timeSheetLineNo: 10000,
  severity: 'Info',
  note: 'A note',
  ...overrides,
});

describe('getVerdictDisplay', () => {
  it('maps each verdict to its chip label and colour', () => {
    expect(getVerdictDisplay('Approve')).toEqual({ label: 'Looks good', tone: 'green' });
    expect(getVerdictDisplay('Check')).toEqual({ label: 'Worth a check', tone: 'amber' });
    expect(getVerdictDisplay('Query')).toEqual({ label: 'Query before approving', tone: 'red' });
  });

  it('treats an unknown verdict as worth a check, never as an all-clear', () => {
    expect(getVerdictDisplay('Escalate')).toEqual({ label: 'Worth a check', tone: 'amber' });
  });
});

describe('computeVersionStamp', () => {
  it('returns the latest lastModifiedDateTime across lines and details', () => {
    const lines = [
      { lastModifiedDateTime: '2026-10-05T08:00:00Z' },
      { lastModifiedDateTime: '2026-10-05T08:30:00Z' },
    ];
    const details = [{ lastModifiedDateTime: '2026-10-05T08:45:00.123Z' }, {}];
    expect(computeVersionStamp(lines, details)).toBe('2026-10-05T08:45:00.123Z');
  });

  it("ignores blanks and BC's 0001-01-01 placeholder", () => {
    expect(computeVersionStamp([{ lastModifiedDateTime: '0001-01-01T00:00:00Z' }, {}])).toBeNull();
    expect(computeVersionStamp(undefined, [])).toBeNull();
  });
});

describe('latestStamp', () => {
  it('picks the later stamp and tolerates missing ones', () => {
    expect(latestStamp('2026-10-05T08:00:00Z', '2026-10-05T09:00:00Z')).toBe(
      '2026-10-05T09:00:00Z'
    );
    expect(latestStamp('2026-10-05T08:00:00Z', null)).toBe('2026-10-05T08:00:00Z');
    expect(latestStamp(undefined, '2026-10-05T08:00:00Z')).toBe('2026-10-05T08:00:00Z');
    expect(latestStamp(null, null)).toBeNull();
  });
});

describe('isReviewOutOfDate', () => {
  it('is out of date only when the timesheet changed after the reviewed version', () => {
    const reviewed = review({ versionStamp: '2026-10-05T09:00:00Z' });
    expect(isReviewOutOfDate(reviewed, '2026-10-05T09:00:00.001Z')).toBe(true);
    expect(isReviewOutOfDate(reviewed, '2026-10-05T09:00:00Z')).toBe(false);
    expect(isReviewOutOfDate(reviewed, '2026-10-05T08:59:59Z')).toBe(false);
  });

  it('compares instants, not strings, across time zone offsets', () => {
    const reviewed = review({ versionStamp: '2026-10-05T09:00:00Z' });
    expect(isReviewOutOfDate(reviewed, '2026-10-05T10:30:00+01:00')).toBe(true);
    expect(isReviewOutOfDate(reviewed, '2026-10-05T09:30:00+01:00')).toBe(false);
  });

  it('never hides a review because a timestamp is unknown', () => {
    expect(isReviewOutOfDate(review(), null)).toBe(false);
    expect(isReviewOutOfDate(review({ versionStamp: '' }), '2026-10-06T00:00:00Z')).toBe(false);
  });
});

describe('pickLatestReviews', () => {
  it('keeps the newest review per timesheet', () => {
    const latest = pickLatestReviews([
      review({ entryNo: 1, timeSheetNo: 'TS0001', reviewedAt: '2026-10-05T09:10:00Z' }),
      review({ entryNo: 3, timeSheetNo: 'TS0001', reviewedAt: '2026-10-06T09:10:00Z' }),
      review({ entryNo: 2, timeSheetNo: 'TS0002', reviewedAt: '2026-10-05T10:00:00Z' }),
    ]);
    expect(latest.TS0001.entryNo).toBe(3);
    expect(latest.TS0002.entryNo).toBe(2);
  });

  it('breaks a reviewedAt tie by the later entry', () => {
    const latest = pickLatestReviews([review({ entryNo: 5 }), review({ entryNo: 4 })]);
    expect(latest.TS0001.entryNo).toBe(5);
  });
});

describe('getReviewStatus', () => {
  const base = {
    available: true,
    fetched: true,
    review: null,
    submitted: true,
    currentStamp: '2026-10-05T09:00:00Z',
  };

  it('is unavailable when the endpoints are missing, whatever else is known', () => {
    expect(getReviewStatus({ ...base, available: false, review: review() })).toBe('unavailable');
  });

  it('is loading before the first fetch and error if that fetch failed', () => {
    expect(getReviewStatus({ ...base, fetched: false })).toBe('loading');
    expect(getReviewStatus({ ...base, fetched: false, failed: true })).toBe('error');
  });

  it('is awaiting when submitted without a review, and none when not submitted', () => {
    expect(getReviewStatus(base)).toBe('awaiting');
    expect(getReviewStatus({ ...base, submitted: false })).toBe('none');
  });

  it('is current or outOfDate once reviewed', () => {
    expect(getReviewStatus({ ...base, review: review() })).toBe('current');
    expect(
      getReviewStatus({ ...base, review: review(), currentStamp: '2026-10-05T11:00:00Z' })
    ).toBe('outOfDate');
  });
});

describe('needsReviewRefresh', () => {
  it('keeps checking submitted timesheets that await a first review or a re-review', () => {
    expect(needsReviewRefresh('awaiting', true)).toBe(true);
    expect(needsReviewRefresh('outOfDate', true)).toBe(true);
  });

  it('retries a submitted timesheet whose first fetch failed', () => {
    expect(needsReviewRefresh('error', true)).toBe(true);
    expect(needsReviewRefresh('error', false)).toBe(false);
  });

  it('stops once reviewed, or when the timesheet is no longer submitted', () => {
    expect(needsReviewRefresh('current', true)).toBe(false);
    expect(needsReviewRefresh('outOfDate', false)).toBe(false);
    expect(needsReviewRefresh('unavailable', true)).toBe(false);
  });
});

describe('groupNotesByLine and worstSeverity', () => {
  it('groups notes by timesheet line, most severe first', () => {
    const grouped = groupNotesByLine([
      note({ lineNo: 1, timeSheetLineNo: 10000, severity: 'Info' }),
      note({ lineNo: 2, timeSheetLineNo: 10000, severity: 'Issue' }),
      note({ lineNo: 3, timeSheetLineNo: 0, severity: 'Warning' }),
    ]);
    expect(grouped.get(10000)?.map((n) => n.severity)).toEqual(['Issue', 'Info']);
    expect(grouped.get(0)).toHaveLength(1);
  });

  it('finds the worst severity', () => {
    expect(worstSeverity([note({ severity: 'Info' }), note({ severity: 'Warning' })])).toBe(
      'Warning'
    );
    expect(worstSeverity([])).toBeNull();
  });
});

describe('buildRejectionComment', () => {
  it('combines the summary with Issue and Warning notes, leaving out Info', () => {
    const comment = buildRejectionComment(
      review({ summary: 'Two days look over-booked.' }),
      [
        note({ lineNo: 1, timeSheetLineNo: 10000, severity: 'Info', note: 'Matches the calendar' }),
        note({ lineNo: 2, timeSheetLineNo: 20000, severity: 'Warning', note: 'No description' }),
        note({ lineNo: 3, timeSheetLineNo: 0, severity: 'Issue', note: 'Friday totals 14 hours' }),
      ],
      (lineNo) => (lineNo === 20000 ? 'Contoso website · Design' : undefined)
    );
    expect(comment).toBe(
      'Two days look over-booked.\n\n- Friday totals 14 hours\n- Contoso website · Design: No description'
    );
  });

  it('falls back to the line number when a line has no label', () => {
    const comment = buildRejectionComment(review({ summary: '' }), [
      note({ timeSheetLineNo: 30000, severity: 'Issue', note: 'Wrong project' }),
    ]);
    expect(comment).toBe('- Line 30000: Wrong project');
  });
});
