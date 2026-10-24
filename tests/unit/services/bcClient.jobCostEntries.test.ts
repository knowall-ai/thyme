import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('bcClient.getJobCostEntries', () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c3', 'sandbox');
    vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(bcClient.isExtensionInstalled).mockRestore();
  });

  it("reads every entry type for the project and decodes BC's G/L Account encoding", async () => {
    const fetchMock = stubFetch(200, {
      value: [
        { id: 'e1', jobNo: 'PR-CONTOSO', type: 'Resource', quantity: 8 },
        { id: 'e2', jobNo: 'PR-CONTOSO', type: 'G_x002F_L_x0020_Account', quantity: 1 },
      ],
    });

    const entries = await bcClient.getJobCostEntries('PR-CONTOSO');

    expect(entries?.map((e) => e.type)).toEqual(['Resource', 'G/L Account']);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/jobCostEntries?$filter=');
    expect(decodeURIComponent(url)).toContain("jobNo eq 'PR-CONTOSO'");
  });

  it('returns null on an extension without the endpoint (404), so the caller uses timeEntries', async () => {
    stubFetch(404, { error: { message: 'No HTTP resource was found' } });
    await expect(bcClient.getJobCostEntries('PR-CONTOSO')).resolves.toBeNull();
  });

  it('returns null, rather than failing the page, on any other error', async () => {
    stubFetch(403, { error: { message: 'No permission' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(bcClient.getJobCostEntries('PR-CONTOSO')).resolves.toBeNull();
    warn.mockRestore();
  });
});
