import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

const GOOD_ID = '00000000-0000-0000-0000-00000000a001';

// Ids that would change which URL a request goes to if built in unchecked
const BAD_IDS = ['', 'abc', `${GOOD_ID})/..`, `${GOOD_ID}?$expand=x`, '../timeSheets'];

/** Answers every request with one record, and returns the URLs requested */
function stubFetch(): () => string[] {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ id: GOOD_ID, '@odata.etag': 'W/"1"' }),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.map(([url]) => decodeURIComponent(url));
}

describe('bcClient refuses an id that is not a SystemId', () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c4', 'sandbox');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // [method, the entity set its id would be put into, call]
  const calls: [string, string, (id: string) => Promise<unknown>][] = [
    ['getSuggestionRequest', 'suggestionRequests', (id) => bcClient.getSuggestionRequest(id)],
    [
      'updateTimeSuggestion',
      'timeSuggestions',
      (id) => bcClient.updateTimeSuggestion(id, { status: 'Dismissed' }),
    ],
    ['getResource', 'resources', (id) => bcClient.getResource(id)],
  ];

  for (const [name, entity, call] of calls) {
    it(`${name} throws without requesting that record`, async () => {
      const urls = stubFetch();
      for (const id of BAD_IDS) {
        await expect(call(id)).rejects.toThrow(/invalid .* id/);
      }
      // getResource first checks the extension is installed; nothing may reach the record
      expect(urls().filter((u) => u.includes(`/${entity}(`))).toEqual([]);
    });

    it(`${name} still works with a real SystemId`, async () => {
      const urls = stubFetch();
      await call(GOOD_ID);
      expect(urls().some((u) => u.includes(`/${entity}(${GOOD_ID})`))).toBe(true);
    });
  }
});
