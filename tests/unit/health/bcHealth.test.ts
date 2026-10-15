import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkBcHealth, resetBcHealthCache } from '@/services/health/bcHealthCheck';
import { describeBcHealth, getBcHealthStatus } from '@/utils/bcHealth';

type Answer = 'pass' | 'reject' | 'throw' | 'otherOrigin' | 'noHeaders';

/**
 * Preflight answers in turn: 'pass' (allowed for the origin and headers), 'reject' (401,
 * no CORS headers), 'throw' (no answer), 'otherOrigin' or 'noHeaders' (allowed, but not
 * as Thyme's calls need)
 */
function stubPreflights(...answers: Answer[]) {
  let i = 0;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const answer = answers[i++ % answers.length];
    if (answer === 'throw') throw new TypeError('fetch failed');
    if (answer === 'reject') return new Response('Unauthorized', { status: 401 });
    const origin = (init?.headers as Record<string, string>).Origin;
    return new Response(null, {
      status: 200,
      headers: {
        'access-control-allow-origin': answer === 'otherOrigin' ? 'https://example.com' : origin,
        'access-control-allow-headers':
          answer === 'noHeaders' ? 'authorization' : 'authorization, Content-Type',
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBcHealthCache();
});

describe('getBcHealthStatus', () => {
  it('is ok, degraded, down or unreachable by how many checks passed and answered', () => {
    expect(getBcHealthStatus(3, 3, 3)).toBe('ok');
    expect(getBcHealthStatus(1, 3, 3)).toBe('degraded');
    expect(getBcHealthStatus(0, 3, 3)).toBe('down');
    expect(getBcHealthStatus(0, 0, 3)).toBe('unreachable');
  });

  it('says nothing when all is well, and that it is Microsoft otherwise', () => {
    expect(describeBcHealth('ok')).toBeNull();
    for (const status of ['degraded', 'down', 'unreachable'] as const) {
      expect(describeBcHealth(status)).toMatch(/Microsoft issue, not Thyme/);
    }
  });
});

describe('checkBcHealth', () => {
  it("sends browser-style preflights from Thyme's origin", async () => {
    const fetchMock = stubPreflights('pass');
    const health = await checkBcHealth('https://getthyme.ai');
    expect(health).toMatchObject({ status: 'ok', passed: 3, total: 3 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.businesscentral\.dynamics\.com\//);
    expect(init.method).toBe('OPTIONS');
    expect((init.headers as Record<string, string>).Origin).toBe('https://getthyme.ai');
  });

  it("finds Business Central down when it rejects every preflight, as in today's outage", async () => {
    stubPreflights('reject');
    expect((await checkBcHealth('https://getthyme.ai')).status).toBe('down');
  });

  it('finds it degraded when it rejects some, and unreachable when nothing answers', async () => {
    stubPreflights('pass', 'reject', 'reject');
    expect((await checkBcHealth('https://getthyme.ai')).status).toBe('degraded');
    resetBcHealthCache();
    stubPreflights('throw');
    expect((await checkBcHealth('https://getthyme.ai')).status).toBe('unreachable');
  });

  it("counts a preflight allowed for another origin, or without Thyme's headers, as refused", async () => {
    stubPreflights('otherOrigin');
    expect((await checkBcHealth('https://getthyme.ai')).status).toBe('down');
    resetBcHealthCache();
    stubPreflights('noHeaders');
    expect((await checkBcHealth('https://getthyme.ai')).status).toBe('down');
  });

  it('shares one round of checks between people asking at the same time', async () => {
    const fetchMock = stubPreflights('pass');
    await Promise.all([checkBcHealth('https://getthyme.ai'), checkBcHealth('https://getthyme.ai')]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the answer for a minute, so Business Central is asked rarely', async () => {
    const fetchMock = stubPreflights('pass');
    await checkBcHealth('https://getthyme.ai');
    await checkBcHealth('https://getthyme.ai');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
