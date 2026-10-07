import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { BCTimeSuggestion } from '@/types';

const getTimeSuggestions = vi.fn();
const updateTimeSuggestion = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getTimeSuggestions: (...args: unknown[]) => getTimeSuggestions(...args),
    updateTimeSuggestion: (...args: unknown[]) => updateTimeSuggestion(...args),
  },
}));

import { useTimeSuggestions, SUGGESTIONS_POLL_INTERVAL_MS } from '@/hooks/useTimeSuggestions';

const suggestion = (id: string, overrides: Partial<BCTimeSuggestion> = {}): BCTimeSuggestion => ({
  id,
  entryNo: 1,
  resourceNo: 'R0001',
  date: '2026-10-06',
  quantity: 1,
  jobNo: 'JOB001',
  jobTaskNo: '100',
  description: 'Contoso design review',
  source: 'Calendar',
  confidence: 'High',
  status: 'Pending',
  '@odata.etag': `W/"${id}-1"`,
  ...overrides,
});

// Local-time Monday, so the week range doesn't depend on the test machine's time zone
const weekOf5Oct = new Date(2026, 9, 5);
const weekOf12Oct = new Date(2026, 9, 12);

describe('useTimeSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTimeSuggestions.mockResolvedValue([suggestion('a'), suggestion('b')]);
    updateTimeSuggestion.mockImplementation(async (id: string) =>
      suggestion(id, { '@odata.etag': `W/"${id}-2"` })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads pending suggestions for the resource and local week range', async () => {
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));

    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
    expect(getTimeSuggestions).toHaveBeenCalledWith('R0001', '2026-10-05', '2026-10-11');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAvailable).toBe(true);
  });

  it('does nothing without a resource', () => {
    const { result } = renderHook(() => useTimeSuggestions(null, weekOf5Oct));
    expect(getTimeSuggestions).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });

  it('reports unavailable when the extension has no timeSuggestions endpoint', async () => {
    getTimeSuggestions.mockResolvedValue(null);
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));

    await waitFor(() => expect(result.current.isAvailable).toBe(false));
    expect(result.current.suggestions).toEqual([]);
  });

  it('refetches when the week changes and ignores the slower previous week', async () => {
    let resolveFirst: (value: BCTimeSuggestion[]) => void = () => {};
    getTimeSuggestions
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce([suggestion('next-week', { date: '2026-10-13' })]);

    const { result, rerender } = renderHook(({ week }) => useTimeSuggestions('R0001', week), {
      initialProps: { week: weekOf5Oct },
    });
    rerender({ week: weekOf12Oct });

    await waitFor(() => expect(result.current.suggestions.map((s) => s.id)).toEqual(['next-week']));
    expect(getTimeSuggestions).toHaveBeenLastCalledWith('R0001', '2026-10-12', '2026-10-18');

    // The first week's response arrives late and must not replace the current week
    await act(async () => resolveFirst([suggestion('stale')]));
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['next-week']);
  });

  it('accept marks the suggestion Accepted with its timesheet line and removes it', async () => {
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(() => result.current.accept(suggestion('a'), 'TS0001', 20000));

    expect(updateTimeSuggestion).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        status: 'Accepted',
        timeSheetNo: 'TS0001',
        timeSheetLineNo: 20000,
      }),
      'W/"a-1"'
    );
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['b']);
  });

  it('dismiss marks the suggestion Dismissed and removes it', async () => {
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(() => result.current.dismiss(suggestion('a')));

    expect(updateTimeSuggestion).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ status: 'Dismissed' }),
      'W/"a-1"'
    );
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['b']);
  });

  it('puts a suggestion back when the dismiss fails', async () => {
    updateTimeSuggestion.mockRejectedValueOnce(new Error('BC API Error (412)'));
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(async () => {
      await expect(result.current.dismiss(suggestion('a'))).rejects.toThrow('412');
    });

    expect(result.current.suggestions.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('undo restores a dismissed suggestion to Pending using the latest ETag', async () => {
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(() => result.current.dismiss(suggestion('a')));
    await act(() => result.current.restore(suggestion('a')));

    expect(updateTimeSuggestion).toHaveBeenLastCalledWith('a', { status: 'Pending' }, 'W/"a-2"');
    expect(result.current.suggestions.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('does not bring back an actioned suggestion from an in-flight refetch', async () => {
    const { result } = renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));

    await act(() => result.current.dismiss(suggestion('a')));
    // BC still reports it as Pending (e.g. the refetch read before the write landed)
    await act(() => result.current.refetch());

    expect(result.current.suggestions.map((s) => s.id)).toEqual(['b']);
  });

  it('polls every few minutes while the page is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(getTimeSuggestions).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(SUGGESTIONS_POLL_INTERVAL_MS);
    });

    expect(getTimeSuggestions).toHaveBeenCalledTimes(2);
  });

  it('refetches on window focus once the last load is stale', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useTimeSuggestions('R0001', weekOf5Oct));
    await waitFor(() => expect(getTimeSuggestions).toHaveBeenCalledTimes(1));

    // Straight after a load, focus doesn't hammer BC
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(getTimeSuggestions).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(getTimeSuggestions).toHaveBeenCalledTimes(2);
  });
});
