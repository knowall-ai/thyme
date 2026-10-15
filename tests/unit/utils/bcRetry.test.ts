import { describe, it, expect } from 'vitest';
import { BC_MAX_RETRIES, getBcRetryDelay } from '@/utils/bcRetry';

describe('getBcRetryDelay', () => {
  it('retries a read BC timed out, was busy for, or throttled, waiting longer each time', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(getBcRetryDelay('GET', status, null, 0)).toBe(1000);
    }
    expect(getBcRetryDelay(undefined, 504, null, 1)).toBe(3000);
  });

  it('gives up after two retries', () => {
    expect(BC_MAX_RETRIES).toBe(2);
    expect(getBcRetryDelay('GET', 504, null, 2)).toBeNull();
  });

  it("doesn't retry writes, which BC may already have applied", () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(getBcRetryDelay(method, 504, null, 0)).toBeNull();
    }
  });

  it("doesn't retry answers another try won't change", () => {
    for (const status of [200, 400, 401, 403, 404, 500]) {
      expect(getBcRetryDelay('GET', status, null, 0)).toBeNull();
    }
  });

  it("waits as long as BC's Retry-After asks, up to ten seconds", () => {
    expect(getBcRetryDelay('GET', 429, '2', 0)).toBe(2000);
    expect(getBcRetryDelay('GET', 429, '120', 0)).toBe(10_000);
    expect(getBcRetryDelay('GET', 429, 'Wed, 21 Oct 2026 07:28:00 GMT', 0)).toBe(1000);
  });
});
