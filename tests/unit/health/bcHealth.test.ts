import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkBcHealth, resetBcHealthCache } from '@/services/health/bcHealthCheck';
import { describeBcHealth, getBcHealthStatus } from '@/utils/bcHealth';

/** Preflight answers in turn: 'pass', 'reject' (401, no CORS header) or 'throw' */
function stubPreflights(...answers: ('pass' | 'reject' | 'throw')[]) {
  let i = 0;
  const fetchMock = vi.fn(async () => {
    const answer = answers[i++ % answers.length];
    if (answer === 'throw') throw new TypeError('fetch failed');
    return answer === 'pass'
      ? new Response(null, { status: 200, headers: { 'access-control-allow-origin': '*' } })
      : new Response('Unauthorized', { status: 401 });
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

  it('keeps the answer for a minute, so Business Central is asked rarely', async () => {
    const fetchMock = stubPreflights('pass');
    await checkBcHealth('https://getthyme.ai');
    await checkBcHealth('https://getthyme.ai');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
