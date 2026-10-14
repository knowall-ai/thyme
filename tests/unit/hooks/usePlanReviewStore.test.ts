import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCPlanReviewChange } from '@/types';

const bc = vi.hoisted(() => ({
  getPlanReviews: vi.fn(),
  getPlanReviewLines: vi.fn(),
  getPlanReviewChanges: vi.fn(),
  getPlanReviewRequests: vi.fn(),
  getPlanReviewRequest: vi.fn(),
  createPlanReviewRequest: vi.fn(),
  getPlanningLinesForCell: vi.fn(),
  createJobPlanningLine: vi.fn(),
  updateJobPlanningLine: vi.fn(),
  deleteJobPlanningLine: vi.fn(),
  getResourceUnitsOfMeasure: vi.fn(),
}));

vi.mock('@/services/bc', () => ({ bcClient: bc }));

import { usePlanReviewStore } from '@/hooks/usePlanReviewStore';

const scope = {
  subjectType: 'Resource' as const,
  subjectNos: ['R0010'],
  weekStarts: ['2026-10-19'],
};
const KEY = 'Resource|R0010|2026-10-19';

const change: BCPlanReviewChange = {
  reviewEntryNo: 1,
  reviewLineNo: 10000,
  changeNo: 10000,
  jobNo: 'PR00090',
  jobTaskNo: '100',
  resourceNo: 'R0010',
  planningDate: '2026-10-22',
  currentHours: 7.17,
  proposedHours: 7.25,
};

const cellLine = (quantity: number) => ({
  id: 'line-1',
  type: 'Resource',
  quantity,
  '@odata.etag': 'W/"1"',
});

describe('usePlanReviewStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanReviewStore.getState().reset();
    bc.getPlanReviewRequests.mockResolvedValue([]);
    bc.getPlanReviewLines.mockResolvedValue([]);
  });

  it('hides the feature when the extension has no planReviews API', async () => {
    bc.getPlanReviews.mockResolvedValue(undefined);
    await usePlanReviewStore.getState().load(scope);
    expect(usePlanReviewStore.getState().available).toBe(false);
    expect(bc.getPlanReviewRequests).not.toHaveBeenCalled();
  });

  it('keeps the latest review per subject-week with its findings', async () => {
    bc.getPlanReviews.mockResolvedValue([
      {
        id: 'b',
        entryNo: 2,
        subjectType: 'Resource',
        subjectNo: 'R0010',
        weekStart: '2026-10-19',
        planHash: 'h2',
        verdict: 'Query',
        reviewedAt: '2026-10-16T09:00:00Z',
      },
      {
        id: 'a',
        entryNo: 1,
        subjectType: 'Resource',
        subjectNo: 'R0010',
        weekStart: '2026-10-19',
        planHash: 'h1',
        verdict: 'Check',
        reviewedAt: '2026-10-15T09:00:00Z',
      },
    ]);
    bc.getPlanReviewLines.mockResolvedValue([
      {
        reviewEntryNo: 2,
        lineNo: 10000,
        severity: 'Issue',
        check: 'CALENDAR',
        planningDate: '2026-10-22',
        jobNo: '',
        resourceNo: 'R0010',
        note: 'Holiday',
      },
    ]);
    await usePlanReviewStore.getState().load(scope);
    const state = usePlanReviewStore.getState();
    expect(state.available).toBe(true);
    expect(state.reviews[KEY].entryNo).toBe(2);
    expect(bc.getPlanReviewLines).toHaveBeenCalledWith([2]);
    expect(state.lines[2]).toHaveLength(1);
  });

  it('follows a request until it ends, then fetches the new review', async () => {
    bc.getPlanReviews.mockResolvedValue([]);
    bc.createPlanReviewRequest.mockResolvedValue({
      id: 'q1',
      entryNo: 1,
      subjectType: 'Resource',
      subjectNo: 'R0010',
      weekStart: '2026-10-19',
      status: 'Requested',
      progress: '',
      errorMessage: '',
    });
    await usePlanReviewStore.getState().load(scope);
    await usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19');
    expect(usePlanReviewStore.getState().requests[KEY].status).toBe('Requested');

    // Poppie finished: no longer open, and it failed
    bc.getPlanReviewRequests.mockResolvedValue([]);
    bc.getPlanReviewRequest.mockResolvedValue({
      id: 'q1',
      entryNo: 1,
      subjectType: 'Resource',
      subjectNo: 'R0010',
      weekStart: '2026-10-19',
      status: 'Failed',
      progress: '',
      errorMessage: 'Try again later.',
    });
    bc.getPlanReviews.mockClear();
    await usePlanReviewStore.getState().load(scope, { requestsOnly: true });
    expect(bc.getPlanReviews).toHaveBeenCalledTimes(1);
    expect(usePlanReviewStore.getState().requests[KEY]).toEqual(
      expect.objectContaining({ status: 'Failed', errorMessage: 'Try again later.' })
    );
  });

  it('turns a refused request into a message to show', async () => {
    bc.createPlanReviewRequest.mockRejectedValue(new Error('BC API Error (403): not allowed'));
    bc.getPlanReviewRequests.mockResolvedValue([]);
    await expect(
      usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19')
    ).rejects.toThrow("You can't ask Poppie to review this plan.");
  });

  describe('applyChanges', () => {
    const uomMap = new Map([['R0010:DAY', 7.5]]);

    it('writes nothing when the cell changed since Poppie looked', async () => {
      bc.getPlanningLinesForCell.mockResolvedValue([cellLine(7.5)]);
      const result = await usePlanReviewStore.getState().applyChanges([change], uomMap);
      expect(result.status).toBe('stale');
      expect(bc.updateJobPlanningLine).not.toHaveBeenCalled();
      expect(bc.createJobPlanningLine).not.toHaveBeenCalled();
      expect(bc.deleteJobPlanningLine).not.toHaveBeenCalled();
    });

    it('updates the planning line when it still matches', async () => {
      bc.getPlanningLinesForCell.mockResolvedValue([cellLine(7.1666667)]);
      const result = await usePlanReviewStore.getState().applyChanges([change], uomMap);
      expect(result).toEqual({ status: 'applied', written: 1 });
      expect(bc.updateJobPlanningLine).toHaveBeenCalledWith('line-1', { quantity: 7.25 }, 'W/"1"');
    });

    it("writes nothing when the cell can't be read", async () => {
      bc.getPlanningLinesForCell.mockRejectedValue(new Error('BC API Error (500)'));
      await expect(usePlanReviewStore.getState().applyChanges([change], uomMap)).rejects.toThrow();
      expect(bc.createJobPlanningLine).not.toHaveBeenCalled();
    });

    it('loads units of measure strictly when none are cached', async () => {
      bc.getResourceUnitsOfMeasure.mockResolvedValue([]);
      bc.getPlanningLinesForCell.mockResolvedValue([cellLine(7.17)]);
      await usePlanReviewStore.getState().applyChanges([change], new Map());
      expect(bc.getResourceUnitsOfMeasure).toHaveBeenCalledWith({ strict: true });
    });
  });
});
