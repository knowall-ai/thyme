import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const getAgentHeartbeats = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { getAgentHeartbeats: (...args: unknown[]) => getAgentHeartbeats(...args) },
}));

import { useAgentPresence, AGENT_PRESENCE_POLL_INTERVAL_MS } from '@/hooks/useAgentPresence';

describe('useAgentPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is online with a fresh heartbeat', async () => {
    getAgentHeartbeats.mockResolvedValue([
      { id: '1', agentName: 'POPPIE', lastSeenAt: new Date(Date.now() - 30_000).toISOString() },
    ]);
    const { result } = renderHook(() => useAgentPresence(true));
    await waitFor(() => expect(result.current.isAvailable).toBe(true));
    expect(result.current.state).toBe('online');
  });

  it('is unavailable (behave as before) on an extension without the API', async () => {
    getAgentHeartbeats.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentPresence(true));
    await waitFor(() => expect(getAgentHeartbeats).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.isAvailable).toBe(false);
  });

  it('does nothing while disabled', () => {
    const { result } = renderHook(() => useAgentPresence(false));
    expect(getAgentHeartbeats).not.toHaveBeenCalled();
    expect(result.current.isAvailable).toBe(false);
  });

  it('goes offline when the heartbeat stops, re-reading every minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const seen = new Date(Date.now() - 60_000).toISOString();
    getAgentHeartbeats.mockResolvedValue([{ id: '1', agentName: 'POPPIE', lastSeenAt: seen }]);
    const { result } = renderHook(() => useAgentPresence(true));
    await waitFor(() => expect(result.current.state).toBe('online'));

    // Five more minutes with the same (old) heartbeat, and the reads failing meanwhile
    getAgentHeartbeats.mockRejectedValue(new Error('network'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_PRESENCE_POLL_INTERVAL_MS * 5);
    });
    expect(result.current.state).toBe('offline');
    expect(result.current.lastSeenAt?.toISOString()).toBe(seen);
  });
});
