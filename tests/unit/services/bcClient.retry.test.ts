import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

beforeEach(() => {
  bcClient.setCompany('00000000-0000-0000-0000-0000000000c2', 'sandbox');
  vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(bcClient.isExtensionInstalled).mockRestore();
});

describe('bcClient retries', () => {
  it('reads again after Business Central times out, and returns the data', async () => {
    const ok = { value: [{ id: 'e1', jobNo: 'PR00010', quantity: 1 }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"Timeout","message":"Request timed out."}}', {
          status: 504,
        })
      )
      .mockResolvedValue(Response.json(ok));
    vi.stubGlobal('fetch', fetchMock);

    const entries = await bcClient.getTimeEntries('PR00010');
    expect(entries.map((e) => e.id)).toEqual(['e1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a call Business Central never answers, and says it's unreachable", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
            )
        )
      );
      const unreachable = vi.fn();
      window.addEventListener('timmie:bc-unreachable', unreachable);
      const entries = bcClient.getTimeEntries('PR00010');
      await vi.advanceTimersByTimeAsync(90_000);
      // getTimeEntries reports a failure as no entries
      expect(await entries).toEqual([]);
      expect(unreachable).toHaveBeenCalledTimes(1);
      window.removeEventListener('timmie:bc-unreachable', unreachable);
    } finally {
      vi.useRealTimers();
    }
  });
});
