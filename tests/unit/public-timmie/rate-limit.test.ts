import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  RateLimiter,
  VOICE_CALLS_PER_IP,
  voiceCalls,
} from '@/services/public-timmie/rate-limit';
import { PUBLIC_LIMITS } from '@/services/public-timmie/shared';

describe('RateLimiter', () => {
  it('allows up to the limit in a window, then blocks with a retry time', () => {
    const limiter = new RateLimiter([{ limit: 3, ms: 60_000 }]);
    const t = 1_000_000;
    expect([1, 2, 3].map(() => limiter.hit('a', t).ok)).toEqual([true, true, true]);
    const blocked = limiter.hit('a', t + 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(50_000);
  });

  it('keys are independent', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 60_000 }]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('b', 0).ok).toBe(true);
    expect(limiter.hit('a', 0).ok).toBe(false);
  });

  it('resets after the window', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 999).ok).toBe(false);
    expect(limiter.hit('a', 1_000).ok).toBe(true);
  });

  it('enforces every window: a daily cap holds even when the minute has room', () => {
    const limiter = new RateLimiter([
      { limit: 2, ms: 60_000 },
      { limit: 3, ms: 86_400_000 },
    ]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 1).ok).toBe(true);
    expect(limiter.hit('a', 2).ok).toBe(false); // minute full
    expect(limiter.hit('a', 60_000).ok).toBe(true); // new minute
    const day = limiter.hit('a', 120_000);
    expect(day.ok).toBe(false); // day full
    expect(day.retryAfterMs).toBe(86_400_000 - 120_000);
  });

  it('blocked requests are not counted', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }]);
    limiter.hit('a', 0);
    for (let i = 0; i < 10; i++) limiter.hit('a', 10);
    expect(limiter.hit('a', 1_000).ok).toBe(true);
  });

  it('stays bounded in memory', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }], 100);
    for (let i = 0; i < 1_000; i++) limiter.hit(`ip-${i}`, i);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});

describe('documented limits (the same as Bookie’s)', () => {
  it('per IP', () => {
    expect(LIMITS.challengePerIp.map((w) => w.limit)).toEqual([20, 100]);
    expect(LIMITS.passPerIp.map((w) => w.limit)).toEqual([6, 30]);
    expect(LIMITS.chatPerIp.map((w) => w.limit)).toEqual([10, 60, 150]);
    expect(LIMITS.voicePerIp.map((w) => w.limit)).toEqual([2, 6, 10]);
  });

  it('global, concurrency and size', () => {
    expect(LIMITS.chatGlobal.map((w) => w.limit)).toEqual([120, 3000]);
    expect(LIMITS.voiceGlobal.map((w) => w.limit)).toEqual([20, 100]);
    expect(LIMITS.voiceConcurrent).toBe(5);
    expect(PUBLIC_LIMITS).toEqual({ maxMessageChars: 600, maxMessages: 20, voiceMaxSeconds: 300 });
  });

  it('caps voice calls: one per IP, five at once', () => {
    expect(VOICE_CALLS_PER_IP).toBe(1);
    expect(voiceCalls.tryStart('198.51.100.1')).toBe('ok');
    expect(voiceCalls.tryStart('198.51.100.1')).toBe('ip');
    for (let i = 2; i <= LIMITS.voiceConcurrent; i++) {
      expect(voiceCalls.tryStart(`198.51.100.${i}`)).toBe('ok');
    }
    expect(voiceCalls.tryStart('198.51.100.99')).toBe('global');
    voiceCalls.end('198.51.100.1');
    expect(voiceCalls.tryStart('198.51.100.1')).toBe('ok');
    for (let i = 1; i <= LIMITS.voiceConcurrent; i++) voiceCalls.end(`198.51.100.${i}`);
    expect(voiceCalls.active).toBe(0);
  });
});
