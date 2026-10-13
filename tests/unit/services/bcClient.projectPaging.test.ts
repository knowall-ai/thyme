import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

// The custom API's base URL, so the second page's @odata.nextLink stays inside it
const base = () => (bcClient as unknown as { customApiBaseUrl: string }).customApiBaseUrl;

/** Two pages: the first links to the second, as BC does for a large result */
function stubTwoPages(entity: string, first: unknown[], second: unknown[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const page2 = url.includes('$skiptoken=2');
    const body = {
      value: page2 ? second : first,
      ...(page2 ? {} : { '@odata.nextLink': `${base()}/${entity}?$skiptoken=2` }),
    };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe("bcClient project page loaders follow every page, as the Projects list's do", () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c2', 'sandbox');
    vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Only the spies: the access token mock must keep its value for the next test
    vi.mocked(bcClient.isExtensionInstalled).mockRestore();
    vi.mocked(console.warn).mockRestore?.();
  });

  it('loads all of a project’s posted time entries', async () => {
    const fetchMock = stubTwoPages(
      'timeEntries',
      [{ id: 'e1', jobNo: 'PR-CONTOSO', quantity: 4 }],
      [{ id: 'e2', jobNo: 'PR-CONTOSO', quantity: 3 }]
    );
    const entries = await bcClient.getTimeEntries('PR-CONTOSO');
    expect(entries.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads all of a project’s planning lines', async () => {
    const line = (id: string) => ({
      id,
      jobNo: 'PR-CONTOSO',
      jobTaskNo: '1000',
      lineType: 'Billable',
      type: 'Resource',
      quantity: 10,
    });
    const fetchMock = stubTwoPages('jobPlanningLines', [line('l1')], [line('l2')]);
    const lines = await bcClient.getJobPlanningLines('PR-CONTOSO');
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still returns nothing, rather than failing the page, on an older extension (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => 'Not found',
      }))
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await bcClient.getTimeEntries('PR-CONTOSO')).toEqual([]);
    expect(await bcClient.getJobPlanningLines('PR-CONTOSO')).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
