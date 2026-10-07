'use client';

import { useEffect, useState } from 'react';
import { bcClient } from '@/services/bc/bcClient';
import type { BCAgentHeartbeat } from '@/types';
import { agentPresence, type AgentPresence } from '@/utils/agentPresence';

// Fresh enough to notice Poppie going offline within a minute or so of the 5-minute threshold
export const AGENT_PRESENCE_POLL_INTERVAL_MS = 60 * 1000;

export interface AgentPresenceResult extends AgentPresence {
  /** False when the extension has no agentHeartbeats API: show nothing, behave as before */
  isAvailable: boolean;
}

/**
 * Whether Poppie is online, from her heartbeat in BC, re-read every minute while enabled
 * (and re-evaluated every minute even when the read fails, so a stale heartbeat still turns
 * into "offline"). Unavailable on extensions without the API.
 */
export function useAgentPresence(enabled: boolean): AgentPresenceResult {
  const [heartbeats, setHeartbeats] = useState<BCAgentHeartbeat[] | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      setNow(Date.now());
      try {
        const result = await bcClient.getAgentHeartbeats();
        if (!cancelled) setHeartbeats(result);
      } catch {
        // Keep the last answer; the clock moving on still ages it
      }
    };
    load();
    const timer = setInterval(load, AGENT_PRESENCE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled || heartbeats === undefined) {
    return { isAvailable: false, state: 'offline', lastSeenAt: null };
  }
  return { isAvailable: true, ...agentPresence(heartbeats, now) };
}
