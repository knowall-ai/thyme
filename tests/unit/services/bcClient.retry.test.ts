import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

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
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c2', 'sandbox');
    vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);

    const entries = await bcClient.getTimeEntries('PR00010');
    expect(entries.map((e) => e.id)).toEqual(['e1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
