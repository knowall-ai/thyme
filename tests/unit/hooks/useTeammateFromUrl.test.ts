import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const toast = vi.fn();
vi.mock('react-hot-toast', () => ({ default: (...args: unknown[]) => toast(...args) }));
vi.mock('@/services/bc/bcClient', () => ({ bcClient: {} }));

import { useTeammateFromUrl } from '@/hooks/useTeammateFromUrl';
import { useTeammateStore } from '@/hooks/useTeammateStore';
import type { Teammate } from '@/types';

const me: Teammate = { id: 'a', resourceNo: 'R0010', displayName: 'Me', isCurrentUser: true };
const colleague: Teammate = { id: 'b', resourceNo: 'R0070', displayName: 'Contoso Person' };

/** What a finished teammates fetch leaves in the store */
const finishLoad = (state: { teammates?: Teammate[]; error?: string | null }) =>
  act(() => {
    useTeammateStore.setState((s) => ({
      teammates: state.teammates ?? [],
      error: state.error ?? null,
      isLoading: false,
      loadCount: s.loadCount + 1,
    }));
  });

describe('useTeammateFromUrl', () => {
  beforeEach(() => {
    toast.mockClear();
    useTeammateStore.setState({
      teammates: [],
      selectedTeammate: null,
      error: null,
      isLoading: false,
      loadCount: 0,
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('is settled straight away without resource=', () => {
    window.history.replaceState(null, '', '/time?week=2026-09-28');
    const { result } = renderHook(() => useTeammateFromUrl());
    expect(result.current).toBe(true);
  });

  it("waits for a fresh list, then opens the teammate's timesheet", () => {
    // A list already in the store (e.g. from another company) doesn't count
    useTeammateStore.setState({ teammates: [colleague], loadCount: 3 });
    window.history.replaceState(null, '', '/time?resource=r0070');
    const { result } = renderHook(() => useTeammateFromUrl());
    expect(result.current).toBe(false);
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();

    finishLoad({ teammates: [me, colleague] });
    expect(result.current).toBe(true);
    expect(useTeammateStore.getState().selectedTeammate).toEqual(colleague);
    expect(toast).not.toHaveBeenCalled();
  });

  it('falls back to your own timesheet with a toast for an unknown resource', () => {
    useTeammateStore.setState({ selectedTeammate: colleague });
    window.history.replaceState(null, '', '/time?resource=R9999');
    const { result } = renderHook(() => useTeammateFromUrl());
    // An earlier selection isn't shown while the link is resolved
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();

    finishLoad({ teammates: [me, colleague] });
    expect(result.current).toBe(true);
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toContain('R9999');
  });

  it('falls back with a toast when the team fails to load', () => {
    window.history.replaceState(null, '', '/time?resource=R0070');
    const { result } = renderHook(() => useTeammateFromUrl());
    finishLoad({ error: 'Network error' });
    expect(result.current).toBe(true);
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('shows your own timesheet, without a toast, for a link to yourself', () => {
    window.history.replaceState(null, '', '/time?resource=R0010');
    const { result } = renderHook(() => useTeammateFromUrl());
    finishLoad({ teammates: [me, colleague] });
    expect(result.current).toBe(true);
    expect(useTeammateStore.getState().selectedTeammate).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('settles at once when the linked teammate is already selected', () => {
    useTeammateStore.setState({ selectedTeammate: colleague });
    window.history.replaceState(null, '', '/time?resource=R0070');
    const { result } = renderHook(() => useTeammateFromUrl());
    expect(result.current).toBe(true);
    expect(useTeammateStore.getState().selectedTeammate).toEqual(colleague);
  });
});
