import { formatDistance } from 'date-fns';
import type { BCAgentHeartbeat } from '@/types';

// Poppie beats her heartbeat every minute; this long without one and she's treated as offline
export const AGENT_OFFLINE_AFTER_MS = 5 * 60 * 1000;
// Poppie's row in agentHeartbeats (her config's createdBy, upper-cased by BC)
export const POPPIE_AGENT_NAME = 'POPPIE';

export type AgentPresenceState = 'online' | 'offline';

export interface AgentPresence {
  state: AgentPresenceState;
  /** The newest heartbeat across agents, or null if none was ever recorded */
  lastSeenAt: Date | null;
}

/**
 * Online when the agent's newest heartbeat is younger than AGENT_OFFLINE_AFTER_MS; offline
 * when it's older or there is none. Other agents' heartbeats don't count. Heartbeats from the
 * future (clock skew) count as now.
 */
export function agentPresence(
  heartbeats: Pick<BCAgentHeartbeat, 'lastSeenAt' | 'agentName'>[],
  now: number = Date.now(),
  offlineAfterMs: number = AGENT_OFFLINE_AFTER_MS,
  agentName: string = POPPIE_AGENT_NAME
): AgentPresence {
  let newest: number | null = null;
  for (const h of heartbeats) {
    if ((h.agentName || '').toUpperCase() !== agentName.toUpperCase()) continue;
    const t = Date.parse(h.lastSeenAt);
    if (Number.isFinite(t) && t > 0 && (newest === null || t > newest)) newest = t;
  }
  if (newest === null) return { state: 'offline', lastSeenAt: null };
  return {
    state: now - Math.min(newest, now) < offlineAfterMs ? 'online' : 'offline',
    lastSeenAt: new Date(newest),
  };
}

/** "Poppie is offline (last seen 2 hours ago)", for the disabled Request button. */
export function offlineText(lastSeenAt: Date | null, now: Date = new Date()): string {
  if (!lastSeenAt) return 'Poppie is offline (not seen yet)';
  const seen = lastSeenAt.getTime() > now.getTime() ? now : lastSeenAt;
  return `Poppie is offline (last seen ${formatDistance(seen, now, { addSuffix: true })})`;
}
