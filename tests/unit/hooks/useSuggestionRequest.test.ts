import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { BCSuggestionRequest } from '@/types';

const getLatestSuggestionRequest = vi.fn();
const getSuggestionRequest = vi.fn();
const createSuggestionRequest = vi.fn();
const canRequestSuggestions = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getLatestSuggestionRequest: (...args: unknown[]) => getLatestSuggestionRequest(...args),
    getSuggestionRequest: (...args: unknown[]) => getSuggestionRequest(...args),
    createSuggestionRequest: (...args: unknown[]) => createSuggestionRequest(...args),
    canRequestSuggestions: (...args: unknown[]) => canRequestSuggestions(...args),
  },
}));

import { useSuggestionRequest, REQUEST_POLL_INTERVAL_MS } from '@/hooks/useSuggestionRequest';

const req = (overrides: Partial<BCSuggestionRequest> = {}): BCSuggestionRequest => ({
  id: 'q1',
  entryNo: 1,
  resourceNo: 'R0001',
  fromDate: '2026-09-28',
  toDate: '2026-10-04',
  status: 'Requested',
  progress: '',
  createdCount: 0,
  updatedCount: 0,
  errorMessage: '',
  requestedAt: new Date().toISOString(),
  ...overrides,
});

// Local-time Monday, so the week range doesn't depend on the test machine's time zone
const weekOf28Sep = new Date(2026, 8, 28);
const weekOf5Oct = new Date(2026, 9, 5);

describe('useSuggestionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestSuggestionRequest.mockResolvedValue(null);
    canRequestSuggestions.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('can request when the extension has the API and BC allows this user', async () => {
    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep));
    await waitFor(() => expect(result.current.canRequest).toBe(true));
    expect(getLatestSuggestionRequest).toHaveBeenCalledWith('R0001', '2026-09-28', '2026-10-04');
    expect(canRequestSuggestions).toHaveBeenCalledWith('R0001');
    expect(result.current.request).toBeNull();
  });

  it('stays hidden on an extension without the API (production before 1.16)', async () => {
    getLatestSuggestionRequest.mockResolvedValue(undefined);
    canRequestSuggestions.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep));
    await waitFor(() => expect(getLatestSuggestionRequest).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.canRequest).toBe(false);
  });

  it('stays hidden when BC says this user may not request for the resource', async () => {
    canRequestSuggestions.mockResolvedValue(false);
    const { result } = renderHook(() => useSuggestionRequest('R0002', weekOf28Sep));
    await waitFor(() => expect(canRequestSuggestions).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.canRequest).toBe(false);
  });

  it('creates a request, polls its progress and reports when it is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFinished = vi.fn();
    createSuggestionRequest.mockResolvedValue(req());
    getSuggestionRequest
      .mockResolvedValueOnce(
        req({ status: 'Running', progress: 'Checking calendar for Mon 28 Sep' })
      )
      .mockResolvedValueOnce(
        req({ status: 'Done', progress: '2 new suggestions.', createdCount: 2 })
      );

    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep, onFinished));
    await waitFor(() => expect(result.current.canRequest).toBe(true));

    await act(() => result.current.requestSuggestions());
    expect(createSuggestionRequest).toHaveBeenCalledWith('R0001', '2026-09-28', '2026-10-04');
    expect(result.current.request?.status).toBe('Requested');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_POLL_INTERVAL_MS);
    });
    expect(result.current.request?.progress).toBe('Checking calendar for Mon 28 Sep');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_POLL_INTERVAL_MS);
    });
    expect(result.current.request?.status).toBe('Done');
    expect(result.current.finishedHere).toBe(true);
    expect(onFinished).toHaveBeenCalledWith(expect.objectContaining({ status: 'Done' }));

    // Finished: no more polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_POLL_INTERVAL_MS * 3);
    });
    expect(getSuggestionRequest).toHaveBeenCalledTimes(2);
  });

  it('picks up a request that was already open when the week is opened', async () => {
    getLatestSuggestionRequest.mockResolvedValue(
      req({ status: 'Running', progress: 'Checking GitHub' })
    );
    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep));
    await waitFor(() => expect(result.current.request?.progress).toBe('Checking GitHub'));
    expect(result.current.finishedHere).toBe(false);
  });

  it('still resumes an open request when the permission read fails', async () => {
    getLatestSuggestionRequest.mockResolvedValue(
      req({ status: 'Running', progress: 'Checking GitHub' })
    );
    canRequestSuggestions.mockRejectedValue(new Error('BC API Error (503): busy'));
    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep));
    await waitFor(() => expect(result.current.request?.progress).toBe('Checking GitHub'));
    expect(result.current.canRequest).toBe(false);
  });

  it('follows the open request when someone already asked for this week', async () => {
    createSuggestionRequest.mockRejectedValue(
      new Error('BC API Error (400): already been requested')
    );
    const { result } = renderHook(() => useSuggestionRequest('R0001', weekOf28Sep));
    await waitFor(() => expect(result.current.canRequest).toBe(true));
    getLatestSuggestionRequest.mockResolvedValue(req({ id: 'other', status: 'Requested' }));

    await act(() => result.current.requestSuggestions());
    expect(result.current.request?.id).toBe('other');
    expect(result.current.error).toBeNull();
  });

  it('explains a refusal from BC', async () => {
    createSuggestionRequest.mockRejectedValue(
      new Error(
        'BC API Error (400): You are not allowed to request time suggestions for resource R0002.'
      )
    );
    const { result } = renderHook(() => useSuggestionRequest('R0002', weekOf28Sep));
    await waitFor(() => expect(result.current.canRequest).toBe(true));
    await act(() => result.current.requestSuggestions());
    expect(result.current.error).toBe("You can't request suggestions for this timesheet.");
  });

  it('drops a slow load for the previous week', async () => {
    let resolveOld: (v: BCSuggestionRequest | null) => void = () => {};
    getLatestSuggestionRequest.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    getLatestSuggestionRequest.mockResolvedValueOnce(null);
    const { result, rerender } = renderHook(({ week }) => useSuggestionRequest('R0001', week), {
      initialProps: { week: weekOf28Sep },
    });
    rerender({ week: weekOf5Oct });
    await waitFor(() => expect(result.current.canRequest).toBe(true));
    await act(async () => resolveOld(req({ status: 'Running' })));
    expect(result.current.request).toBeNull();
  });
});
