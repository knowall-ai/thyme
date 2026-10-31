import { describe, it, expect, vi, beforeEach } from 'vitest';

const bc = vi.hoisted(() => ({
  companyId: 'c1',
  environment: 'sandbox',
  getPlanReviews: vi.fn(),
  getPlanReviewLines: vi.fn(),
  getPlanReviewChanges: vi.fn(),
  getPlanReviewRequests: vi.fn(),
  getPlanReviewRequest: vi.fn(),
  createPlanReviewRequest: vi.fn(),
  applyPlanReviewFinding: vi.fn(),
}));

vi.mock('@/services/bc', () => ({ bcClient: bc }));

import { usePlanReviewStore } from '@/hooks/usePlanReviewStore';

const scope = {
  subjectType: 'Resource' as const,
  subjectNos: ['R0010'],
  weekStarts: ['2026-10-19'],
};
const KEY = 'Resource|R0010|2026-10-19';

describe('usePlanReviewStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bc.companyId = 'c1';
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

  it('re-reads findings on each refresh, so one applied by someone else shows as applied', async () => {
    const reviewRow = {
      id: 'a',
      entryNo: 1,
      subjectType: 'Resource',
      subjectNo: 'R0010',
      weekStart: '2026-10-19',
      planHash: 'h1',
      verdict: 'Check',
      reviewedAt: '2026-10-15T09:00:00Z',
    };
    const findingRow = {
      id: '00000000-0000-0000-0000-00000000f001',
      reviewEntryNo: 1,
      lineNo: 10000,
      severity: 'Warning',
      check: 'ROUNDING',
      planningDate: '2026-10-22',
      jobNo: 'PR00090',
      resourceNo: 'R0010',
      note: 'Odd hours',
      appliedAt: '',
      appliedBy: '',
    };
    bc.getPlanReviews.mockResolvedValue([reviewRow]);
    bc.getPlanReviewLines.mockResolvedValue([findingRow]);
    await usePlanReviewStore.getState().load(scope);
    expect(usePlanReviewStore.getState().lines[1][0].appliedAt).toBe('');

    // Sam applies it in another browser; the next periodic refresh picks that up
    bc.getPlanReviewLines.mockResolvedValue([
      { ...findingRow, appliedAt: '2026-10-22T13:05:00Z', appliedBy: 'Sam Contoso' },
    ]);
    await usePlanReviewStore.getState().load(scope);
    expect(bc.getPlanReviewLines).toHaveBeenCalledTimes(2);
    expect(bc.getPlanReviewLines).toHaveBeenLastCalledWith([1]);
    expect(usePlanReviewStore.getState().lines[1][0]).toEqual(
      expect.objectContaining({ appliedAt: '2026-10-22T13:05:00Z', appliedBy: 'Sam Contoso' })
    );
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
    await usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19', 'Timmie');
    expect(usePlanReviewStore.getState().requests[KEY].status).toBe('Requested');

    // the agent finished: no longer open, and it failed
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

  it("drops a request made in a company that's no longer the active one", async () => {
    bc.getPlanReviews.mockResolvedValue([]);
    bc.createPlanReviewRequest.mockImplementation(async () => {
      bc.companyId = 'c2';
      return {
        id: 'q1',
        entryNo: 1,
        subjectType: 'Resource',
        subjectNo: 'R0010',
        weekStart: '2026-10-19',
        status: 'Requested',
        progress: '',
        errorMessage: '',
      };
    });
    await usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19', 'Timmie');
    expect(usePlanReviewStore.getState().requests[KEY]).toBeUndefined();
  });

  it('re-fetches reviews when a request finishes during a full refresh', async () => {
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
    await usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19', 'Timmie');

    // The full refresh reads reviews first (none yet); then the request turns out to be done,
    // and the agent's review has landed in between
    const newReview = {
      id: 'r1',
      entryNo: 7,
      subjectType: 'Resource',
      subjectNo: 'R0010',
      weekStart: '2026-10-19',
      planHash: 'h1',
      verdict: 'Approve',
      reviewedAt: '2026-10-15T09:00:00Z',
    };
    bc.getPlanReviews.mockReset();
    bc.getPlanReviews.mockResolvedValueOnce([]).mockResolvedValueOnce([newReview]);
    bc.getPlanReviewRequests.mockResolvedValue([]);
    bc.getPlanReviewRequest.mockResolvedValue({
      id: 'q1',
      entryNo: 1,
      subjectType: 'Resource',
      subjectNo: 'R0010',
      weekStart: '2026-10-19',
      status: 'Done',
      progress: '',
      errorMessage: '',
    });
    await usePlanReviewStore.getState().load(scope);
    expect(bc.getPlanReviews).toHaveBeenCalledTimes(2);
    expect(usePlanReviewStore.getState().reviews[KEY]?.entryNo).toBe(7);
    expect(usePlanReviewStore.getState().requests[KEY]).toBeUndefined();
  });

  it("doesn't retry failed changes by itself, only when asked to", async () => {
    bc.getPlanReviewChanges.mockRejectedValue(new Error('BC API Error (500)'));
    await usePlanReviewStore.getState().loadChanges([1]);
    expect(usePlanReviewStore.getState().changes[1]).toBe('error');
    await usePlanReviewStore.getState().loadChanges([1]);
    expect(bc.getPlanReviewChanges).toHaveBeenCalledTimes(1);

    bc.getPlanReviewChanges.mockResolvedValue([]);
    await usePlanReviewStore.getState().loadChanges([1], { retry: true });
    expect(bc.getPlanReviewChanges).toHaveBeenCalledTimes(2);
    expect(usePlanReviewStore.getState().changes[1]).toEqual([]);
  });

  it('keeps a request made while an older refresh was in flight', async () => {
    bc.getPlanReviews.mockResolvedValue([]);
    let answerRequests: (value: unknown[]) => void = () => {};
    bc.getPlanReviewRequests.mockImplementationOnce(
      () => new Promise((resolve) => (answerRequests = resolve))
    );
    const refresh = usePlanReviewStore.getState().load(scope);
    await vi.waitFor(() => expect(bc.getPlanReviewRequests).toHaveBeenCalled());

    // Asked for a review while the refresh waits on BC
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
    await usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19', 'Timmie');

    // The refresh's answer predates the request: it mustn't drop it
    answerRequests([]);
    await refresh;
    expect(usePlanReviewStore.getState().requests[KEY]?.status).toBe('Requested');
  });

  it('turns a refused request into a message to show', async () => {
    bc.createPlanReviewRequest.mockRejectedValue(new Error('BC API Error (403): not allowed'));
    bc.getPlanReviewRequests.mockResolvedValue([]);
    await expect(
      usePlanReviewStore.getState().requestReview('Resource', 'R0010', '2026-10-19', 'Timmie')
    ).rejects.toThrow("You can't ask Timmie to review this plan.");
  });

  describe('applyFinding', () => {
    const finding = {
      id: '00000000-0000-0000-0000-00000000f001',
      reviewEntryNo: 1,
      lineNo: 10000,
      severity: 'Warning' as const,
      check: 'ROUNDING',
      planningDate: '2026-10-22',
      jobNo: 'PR00090',
      resourceNo: 'R0010',
      note: 'Odd hours',
      appliedAt: '',
      appliedBy: '',
    };

    beforeEach(() => {
      usePlanReviewStore.setState({ lines: { 1: [finding] } });
    });

    it('calls BC once and shows when and by whom it was applied', async () => {
      bc.applyPlanReviewFinding.mockResolvedValue(undefined);
      bc.getPlanReviewLines.mockResolvedValue([
        { ...finding, appliedAt: '2026-10-22T13:05:00Z', appliedBy: 'Alex Contoso' },
      ]);
      const result = await usePlanReviewStore.getState().applyFinding(finding);
      expect(result).toEqual({ companyChanged: false });
      expect(bc.applyPlanReviewFinding).toHaveBeenCalledWith(finding.id);
      expect(usePlanReviewStore.getState().lines[1][0]).toEqual(
        expect.objectContaining({ appliedAt: '2026-10-22T13:05:00Z', appliedBy: 'Alex Contoso' })
      );
    });

    it("throws BC's refusal and leaves the finding unapplied", async () => {
      bc.applyPlanReviewFinding.mockRejectedValue(new Error('BC API Error (400): nope'));
      await expect(usePlanReviewStore.getState().applyFinding(finding)).rejects.toThrow();
      expect(usePlanReviewStore.getState().lines[1][0].appliedAt).toBe('');
    });

    it('reports a company switch during the read of the stamp after applying', async () => {
      bc.applyPlanReviewFinding.mockResolvedValue(undefined);
      bc.getPlanReviewLines.mockImplementation(async () => {
        bc.companyId = 'c2';
        return [{ ...finding, appliedAt: '2026-10-22T13:05:00Z', appliedBy: 'Alex Contoso' }];
      });
      const result = await usePlanReviewStore.getState().applyFinding(finding);
      expect(result).toEqual({ companyChanged: true });
    });

    it("doesn't show the result in another company after a switch", async () => {
      bc.applyPlanReviewFinding.mockImplementation(async () => {
        bc.companyId = 'c2';
      });
      const result = await usePlanReviewStore.getState().applyFinding(finding);
      expect(result).toEqual({ companyChanged: true });
      expect(usePlanReviewStore.getState().lines[1][0].appliedAt).toBe('');
    });
  });
});
