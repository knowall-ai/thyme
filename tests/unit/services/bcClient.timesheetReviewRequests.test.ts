import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

const REQUEST_ID = '00000000-0000-0000-0000-00000000e002';

type Respond = (url: string, init?: RequestInit) => { status: number; body: unknown };

function stubFetch(respond: Respond) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = respond(url, init);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const urlOf = (fetchMock: ReturnType<typeof stubFetch>, call = 0) =>
  decodeURIComponent(fetchMock.mock.calls[call][0]);

describe('bcClient timesheet review requests', () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c4', 'sandbox');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads only open requests for the timesheets, and asks for a review', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'POST'
        ? {
            status: 201,
            body: { id: REQUEST_ID, entryNo: 5, timeSheetNo: 'TS0001', status: 'Requested' },
          }
        : {
            status: 200,
            body: {
              value: [
                {
                  id: REQUEST_ID,
                  entryNo: '4',
                  timeSheetNo: 'TS0001',
                  status: 'Running',
                  progress: 'Reading the lines…',
                },
              ],
            },
          }
    );

    const open = await bcClient.getTimesheetReviewRequests(['TS0001', "TS'2", 'TS0001']);
    const url = urlOf(fetchMock);
    expect(url).toContain('/timesheetReviewRequests?$filter=');
    expect(url).toContain(
      "(timeSheetNo eq 'TS0001' or timeSheetNo eq 'TS''2') and (status eq 'Requested' or status eq 'Running')"
    );
    expect(open).toEqual([
      expect.objectContaining({ entryNo: 4, status: 'Running', progress: 'Reading the lines…' }),
    ]);

    const created = await bcClient.createTimesheetReviewRequest('TS0001');
    const [postUrl, init] = fetchMock.mock.calls[1];
    expect(postUrl).toMatch(/\/timesheetReviewRequests$/);
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ timeSheetNo: 'TS0001' });
    expect(created).toEqual(
      expect.objectContaining({
        id: REQUEST_ID,
        timeSheetNo: 'TS0001',
        status: 'Requested',
        progress: '',
        errorMessage: '',
      })
    );
  });

  it('makes no call for no timesheets', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: { value: [] } }));
    await expect(bcClient.getTimesheetReviewRequests([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the extension has no timesheetReviewRequests API yet (404)', async () => {
    stubFetch(() => ({ status: 404, body: 'No HTTP resource was found' }));
    await expect(bcClient.getTimesheetReviewRequests(['TS0001'])).resolves.toBeNull();
  });

  it('passes other errors through', async () => {
    stubFetch(() => ({ status: 500, body: 'Server error' }));
    await expect(bcClient.getTimesheetReviewRequests(['TS0001'])).rejects.toThrow('500');
  });

  it('re-reads one request by its SystemId, and refuses anything else', async () => {
    const fetchMock = stubFetch(() => ({
      status: 200,
      body: {
        id: REQUEST_ID,
        entryNo: 5,
        timeSheetNo: 'TS0001',
        status: 'Failed',
        errorMessage: 'No lines',
      },
    }));
    const request = await bcClient.getTimesheetReviewRequest(REQUEST_ID);
    expect(urlOf(fetchMock)).toMatch(new RegExp(`/timesheetReviewRequests\\(${REQUEST_ID}\\)$`));
    expect(request).toEqual(
      expect.objectContaining({ status: 'Failed', errorMessage: 'No lines' })
    );

    await expect(bcClient.getTimesheetReviewRequest("x') or (1 eq 1")).rejects.toThrow(
      'invalid timesheet review request id'
    );
  });
});
