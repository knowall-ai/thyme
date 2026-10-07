import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getTimesheetReviews = vi.fn();
const getTimesheetReviewLines = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getTimesheetReviews: (...args: unknown[]) => getTimesheetReviews(...args),
    getTimesheetReviewLines: (...args: unknown[]) => getTimesheetReviewLines(...args),
    getCompanies: vi.fn(),
  },
}));

import {
  useTimesheetReviewStore,
  REVIEW_REFRESH_INTERVAL_MS,
} from '@/hooks/useTimesheetReviewStore';
import { useTimesheetReview } from '@/hooks/useTimesheetReview';
import { useCompanyStore } from '@/hooks/useCompanyStore';

const review = (timeSheetNo: string, entryNo: number, versionStamp = '2026-10-05T09:00:00Z') => ({
  id: `r${entryNo}`,
  entryNo,
  timeSheetNo,
  versionStamp,
  verdict: 'Check',
  summary: 'Worth a look',
  reviewer: 'Poppie',
  reviewedAt: '2026-10-05T09:10:00Z',
});

const lineNote = (reviewEntryNo: number, timeSheetLineNo: number) => ({
  id: `n${reviewEntryNo}-${timeSheetLineNo}`,
  reviewEntryNo,
  lineNo: 1,
  timeSheetNo: 'TS0001',
  timeSheetLineNo,
  severity: 'Warning',
  note: 'Check this line',
});

// Let queued microtasks (the batch flush) and resolved fetches run
const settle = () => act(async () => {});

describe('useTimesheetReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimesheetReviewStore.getState().reset();
    getTimesheetReviews.mockResolvedValue([]);
    getTimesheetReviewLines.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches every timesheet on screen into one request', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1)]);
    getTimesheetReviewLines.mockResolvedValue([lineNote(1, 10000)]);

    const { result } = renderHook(() => ({
      a: useTimesheetReview('TS0001', [], undefined, { submitted: true }),
      b: useTimesheetReview('TS0002', [], undefined, { submitted: true }),
    }));
    expect(result.current.a.status).toBe('loading');

    await waitFor(() => expect(result.current.a.status).toBe('current'));
    expect(getTimesheetReviews).toHaveBeenCalledTimes(1);
    expect(getTimesheetReviews).toHaveBeenCalledWith(['TS0001', 'TS0002']);
    expect(getTimesheetReviewLines).toHaveBeenCalledWith([1]);
    expect(result.current.a.verdict).toEqual({ label: 'Worth a check', tone: 'amber' });
    expect(result.current.a.notesByLine.get(10000)).toHaveLength(1);
    expect(result.current.b.status).toBe('awaiting');
  });

  it('marks the review out of date when the timesheet changed after it', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1, '2026-10-05T09:00:00Z')]);
    const lines = [{ lastModifiedDateTime: '2026-10-05T09:30:00Z' }];

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', lines, undefined, { submitted: true })
    );

    await waitFor(() => expect(result.current.status).toBe('outOfDate'));
  });

  it('waits for every timestamp source before calling a review current', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1, '2026-10-05T09:00:00Z')]);
    const lines = [{ lastModifiedDateTime: '2026-10-05T08:00:00Z' }];

    const { result, rerender } = renderHook(
      ({ details }: { details?: { lastModifiedDateTime?: string }[] }) =>
        useTimesheetReview('TS0001', lines, details, {
          submitted: true,
          versionReady: details !== undefined,
        }),
      { initialProps: {} as { details?: { lastModifiedDateTime?: string }[] } }
    );
    await settle();
    // Fetched, but details haven't loaded: not yet known to be current
    expect(getTimesheetReviews).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('loading');

    // A detail changed after the review
    rerender({ details: [{ lastModifiedDateTime: '2026-10-05T10:00:00Z' }] });
    expect(result.current.status).toBe('outOfDate');
  });

  it('reports out of date from lines alone while details are still loading', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1, '2026-10-05T09:00:00Z')]);
    const lines = [{ lastModifiedDateTime: '2026-10-05T09:30:00Z' }];

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', lines, undefined, { submitted: true, versionReady: false })
    );

    await waitFor(() => expect(result.current.status).toBe('outOfDate'));
  });

  it('counts a local edit as a change via versionStamp', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1, '2026-10-05T09:00:00Z')]);

    const { result, rerender } = renderHook(
      ({ stamp }: { stamp: string | null }) =>
        useTimesheetReview('TS0001', undefined, undefined, {
          submitted: false,
          versionStamp: stamp,
        }),
      { initialProps: { stamp: '2026-10-05T08:00:00Z' as string | null } }
    );
    await waitFor(() => expect(result.current.status).toBe('current'));

    rerender({ stamp: '2026-10-06T08:00:00Z' });
    expect(result.current.status).toBe('outOfDate');
  });

  it('hides itself when the review endpoint does not exist', async () => {
    getTimesheetReviews.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(getTimesheetReviewLines).not.toHaveBeenCalled();
  });

  it('hides itself when the review lines endpoint does not exist', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1)]);
    getTimesheetReviewLines.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.review).toBeNull();
  });

  it('retries a failed first fetch on the polling interval', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getTimesheetReviews.mockRejectedValueOnce(new Error('BC API Error (503): busy'));

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await settle();
    expect(result.current.status).toBe('error');

    getTimesheetReviews.mockResolvedValue([review('TS0001', 2)]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEW_REFRESH_INTERVAL_MS);
    });
    expect(result.current.status).toBe('current');
    warn.mockRestore();
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true, enabled: false })
    );
    await settle();
    expect(getTimesheetReviews).not.toHaveBeenCalled();
    expect(result.current.status).toBe('none');
  });

  it('shows an error state when the first fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getTimesheetReviews.mockRejectedValue(new Error('BC API Error (500): boom'));

    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    warn.mockRestore();
  });

  it('polls while awaiting a review and stops once it arrives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await settle();
    expect(result.current.status).toBe('awaiting');
    expect(getTimesheetReviews).toHaveBeenCalledTimes(1);

    // Poppie reviews it before the next check
    getTimesheetReviews.mockResolvedValue([review('TS0001', 7)]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEW_REFRESH_INTERVAL_MS);
    });
    expect(getTimesheetReviews).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('current');

    // Nothing visible is awaiting now, so the interval stops
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEW_REFRESH_INTERVAL_MS * 3);
    });
    expect(getTimesheetReviews).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the timesheet leaves the screen', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await settle();
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVIEW_REFRESH_INTERVAL_MS * 2);
    });
    expect(getTimesheetReviews).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh cache without refetching', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1)]);
    const first = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await waitFor(() => expect(first.result.current.status).toBe('current'));
    first.unmount();

    const second = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await settle();
    expect(second.result.current.status).toBe('current');
    expect(getTimesheetReviews).toHaveBeenCalledTimes(1);
    // The review's notes are cached by entry, so they're not requested again either
    expect(getTimesheetReviewLines).toHaveBeenCalledTimes(1);
  });

  it('drops cached reviews when the company changes', async () => {
    getTimesheetReviews.mockResolvedValue([review('TS0001', 1)]);
    const { result } = renderHook(() =>
      useTimesheetReview('TS0001', [], undefined, { submitted: true })
    );
    await waitFor(() => expect(result.current.status).toBe('current'));

    getTimesheetReviews.mockResolvedValue([]);
    act(() => {
      useCompanyStore.setState((s) => ({ companyVersion: s.companyVersion + 1 }));
    });

    // Refetched for the new company, which has no review yet
    await waitFor(() => expect(result.current.status).toBe('awaiting'));
    expect(getTimesheetReviews).toHaveBeenCalledTimes(2);
  });
});
