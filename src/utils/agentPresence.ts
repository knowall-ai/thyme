import { formatDistance } from 'date-fns';
import type { BCAgentHeartbeat } from '@/types';

// The agent beats its heartbeat every minute; this long without one and it's treated as offline
export const AGENT_OFFLINE_AFTER_MS = 5 * 60 * 1000;

export type AgentPresenceState = 'online' | 'offline';

export interface AgentPresence {
  state: AgentPresenceState;
  /** The newest heartbeat across agents, or null if none was ever recorded */
  lastSeenAt: Date | null;
}

/**
 * Online when the agent's newest heartbeat is younger than AGENT_OFFLINE_AFTER_MS; offline
 * when it's older or there is none. The agent is matched by name, ignoring case (BC
 * upper-cases it), and other agents' heartbeats don't count. Heartbeats from the future
 * (clock skew) count as now.
 *
 * With fallbackToAnyAgent (the organisation still has Timmie's default agent), when no
 * heartbeat carries the name at all the newest heartbeat of any agent is used instead: an
 * organisation that hasn't named its own agent in Settings yet (so it's still "Timmie" while
 * its agent beats as, say, "CONTOSO BOT") doesn't see its connected agent as offline. A
 * custom agent is always matched by name, so a wrong name shows as offline.
 */
export function agentPresence(
  heartbeats: Pick<BCAgentHeartbeat, 'lastSeenAt' | 'agentName'>[],
  agentName: string,
  now: number = Date.now(),
  offlineAfterMs: number = AGENT_OFFLINE_AFTER_MS,
  fallbackToAnyAgent = false
): AgentPresence {
  const wanted = agentName.trim().toUpperCase();
  const named = heartbeats.filter((h) => (h.agentName || '').trim().toUpperCase() === wanted);
  let newest: number | null = null;
  for (const h of named.length > 0 || !fallbackToAnyAgent ? named : heartbeats) {
    const t = Date.parse(h.lastSeenAt);
    if (Number.isFinite(t) && t > 0 && (newest === null || t > newest)) newest = t;
  }
  if (newest === null) return { state: 'offline', lastSeenAt: null };
  return {
    state: now - Math.min(newest, now) < offlineAfterMs ? 'online' : 'offline',
    lastSeenAt: new Date(newest),
  };
}

/** "Timmie is offline (last seen 2 hours ago)", for the disabled Request button. */
export function offlineText(
  agentName: string,
  lastSeenAt: Date | null,
  now: Date = new Date()
): string {
  if (!lastSeenAt) return `${agentName} is offline (not seen yet)`;
  const seen = lastSeenAt.getTime() > now.getTime() ? now : lastSeenAt;
  return `${agentName} is offline (last seen ${formatDistance(seen, now, { addSuffix: true })})`;
}
