import { describe, it, expect } from 'vitest';
import { AGENT_OFFLINE_AFTER_MS, agentPresence, offlineText } from '@/utils/agentPresence';

const now = Date.parse('2026-10-08T14:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('agentPresence', () => {
  it('is online while the newest heartbeat is under the threshold', () => {
    expect(agentPresence([{ agentName: 'POPPIE', lastSeenAt: ago(60_000) }], now).state).toBe(
      'online'
    );
    expect(
      agentPresence([{ agentName: 'POPPIE', lastSeenAt: ago(AGENT_OFFLINE_AFTER_MS - 1) }], now)
        .state
    ).toBe('online');
  });

  it('is offline once the newest heartbeat reaches the threshold', () => {
    const p = agentPresence(
      [{ agentName: 'POPPIE', lastSeenAt: ago(AGENT_OFFLINE_AFTER_MS) }],
      now
    );
    expect(p.state).toBe('offline');
    expect(p.lastSeenAt?.toISOString()).toBe(ago(AGENT_OFFLINE_AFTER_MS));
  });

  it('is offline with no heartbeat at all, or only unreadable ones', () => {
    expect(agentPresence([], now)).toEqual({ state: 'offline', lastSeenAt: null });
    expect(
      agentPresence([{ agentName: 'POPPIE', lastSeenAt: '0001-01-01T00:00:00Z' }], now).lastSeenAt
    ).toBeNull();
    expect(agentPresence([{ agentName: 'POPPIE', lastSeenAt: 'nonsense' }], now).state).toBe(
      'offline'
    );
  });

  it('uses the newest of several heartbeats', () => {
    const p = agentPresence(
      [
        { agentName: 'POPPIE', lastSeenAt: ago(3_600_000) },
        { agentName: 'poppie', lastSeenAt: ago(30_000) },
      ],
      now
    );
    expect(p.state).toBe('online');
  });

  it("ignores other agents' heartbeats", () => {
    const p = agentPresence(
      [
        { agentName: 'CONTOSO BOT', lastSeenAt: ago(10_000) },
        { agentName: 'POPPIE', lastSeenAt: ago(3_600_000) },
      ],
      now
    );
    expect(p.state).toBe('offline');
    expect(agentPresence([{ agentName: 'CONTOSO BOT', lastSeenAt: ago(10_000) }], now)).toEqual({
      state: 'offline',
      lastSeenAt: null,
    });
  });

  it('treats a heartbeat ahead of this clock (skew) as now', () => {
    expect(agentPresence([{ agentName: 'POPPIE', lastSeenAt: ago(-120_000) }], now).state).toBe(
      'online'
    );
  });

  it('honours a custom threshold', () => {
    expect(
      agentPresence([{ agentName: 'POPPIE', lastSeenAt: ago(90_000) }], now, 60_000).state
    ).toBe('offline');
  });
});

describe('offlineText', () => {
  it('says when Poppie was last seen', () => {
    expect(offlineText(new Date(now - 2 * 3_600_000), new Date(now))).toBe(
      'Poppie is offline (last seen about 2 hours ago)'
    );
    expect(offlineText(null)).toBe('Poppie is offline (not seen yet)');
  });
});
