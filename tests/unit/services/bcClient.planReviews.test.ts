import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';
import { bcErrorText } from '@/utils/projectSourceLinks';

const REQUEST_ID = '00000000-0000-0000-0000-00000000e001';
const FINDING_ID = '00000000-0000-0000-0000-00000000f001';

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

describe('bcClient plan reviews', () => {
  beforeEach(() => {
    bcClient.setCompany('00000000-0000-0000-0000-0000000000c3', 'sandbox');
    vi.spyOn(bcClient, 'isExtensionInstalled').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(bcClient.isExtensionInstalled).mockRestore();
  });

  it('loads reviews for subjects and weeks, newest first, leaving out PENDING headers', async () => {
    const fetchMock = stubFetch(() => ({
      status: 200,
      body: {
        value: [
          {
            id: 'a',
            entryNo: 1,
            subjectType: 'Resource',
            subjectNo: 'R0010',
            weekStart: '2026-10-19',
            planHash: 'ABC',
            verdict: 'Approve',
            summary: 'Fine',
            reviewer: 'Poppie',
            reviewedAt: '2026-10-15T09:00:00Z',
          },
          {
            id: 'b',
            entryNo: 2,
            subjectType: 'Resource',
            subjectNo: 'R0010',
            weekStart: '2026-10-19',
            planHash: 'def',
            verdict: 'Check',
            reviewedAt: '2026-10-16T09:00:00Z',
          },
          {
            id: 'c',
            entryNo: 3,
            subjectType: 'Resource',
            subjectNo: 'R0010',
            weekStart: '2026-10-19',
            planHash: 'PENDING',
            verdict: 'Check',
            reviewedAt: '2026-10-17T09:00:00Z',
          },
        ],
      },
    }));

    const reviews = await bcClient.getPlanReviews(
      'Resource',
      ['R0010', "O'Brien"],
      ['2026-10-26', '2026-10-19']
    );

    expect(urlOf(fetchMock)).toContain(
      "/planReviews?$filter=subjectType eq 'Resource' and weekStart ge 2026-10-19 and weekStart le 2026-10-26 and (subjectNo eq 'R0010' or subjectNo eq 'O''Brien')"
    );
    expect(reviews?.map((r) => r.id)).toEqual(['b', 'a']);
    expect(reviews?.[1]).toEqual(
      expect.objectContaining({ planHash: 'abc', verdict: 'Approve', summary: 'Fine' })
    );
  });

  it('batches many subjects into several requests', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: { value: [] } }));
    const subjects = Array.from({ length: 20 }, (_, i) => `R${i}`);
    await bcClient.getPlanReviews('Project', subjects, ['2026-10-19']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(fetchMock, 0)).toContain("subjectType eq 'Project'");
  });

  it('returns undefined when the extension has no planReviews API yet (404)', async () => {
    stubFetch(() => ({ status: 404, body: 'No HTTP resource was found' }));
    await expect(bcClient.getPlanReviews('Resource', ['R0010'], ['2026-10-19'])).resolves.toBe(
      undefined
    );
    await expect(bcClient.getPlanReviewLines([1])).resolves.toBeUndefined();
    await expect(bcClient.getPlanReviewChanges([1])).resolves.toBeUndefined();
    await expect(
      bcClient.getPlanReviewRequests('Resource', ['R0010'], ['2026-10-19'])
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown subject type rather than putting it in a filter', async () => {
    stubFetch(() => ({ status: 200, body: { value: [] } }));
    await expect(
      bcClient.getPlanReviews("Resource' or 1 eq 1" as never, ['R0010'], ['2026-10-19'])
    ).rejects.toThrow('invalid plan review subject type');
  });

  it('maps findings and changes', async () => {
    const fetchMock = stubFetch((url) =>
      url.includes('/planReviewLines')
        ? {
            status: 200,
            body: {
              value: [
                {
                  reviewEntryNo: 2,
                  lineNo: 20000,
                  severity: 'Issue',
                  check: 'CALENDAR',
                  planningDate: '0001-01-01',
                  jobNo: '',
                  resourceNo: 'R0010',
                  note: 'Holiday',
                },
                {
                  reviewEntryNo: 2,
                  lineNo: 10000,
                  severity: 'Warning',
                  check: 'ROUNDING',
                  planningDate: '2026-10-22',
                  jobNo: 'PR00090',
                  resourceNo: 'R0010',
                  note: '7.17h is not a quarter hour',
                },
              ],
            },
          }
        : {
            status: 200,
            body: {
              value: [
                {
                  reviewEntryNo: 2,
                  reviewLineNo: 10000,
                  changeNo: 10000,
                  jobNo: 'PR00090',
                  jobTaskNo: '100',
                  resourceNo: 'R0010',
                  planningDate: '2026-10-22',
                  currentHours: 7.17,
                  proposedHours: 7.25,
                },
              ],
            },
          }
    );

    const lines = await bcClient.getPlanReviewLines([2, 3]);
    expect(urlOf(fetchMock)).toContain(
      '/planReviewLines?$filter=reviewEntryNo eq 2 or reviewEntryNo eq 3'
    );
    expect(lines?.map((l) => l.lineNo)).toEqual([10000, 20000]);
    expect(lines?.[1].planningDate).toBe('');

    const changes = await bcClient.getPlanReviewChanges([2]);
    expect(changes).toEqual([
      expect.objectContaining({
        currentHours: 7.17,
        proposedHours: 7.25,
        planningDate: '2026-10-22',
      }),
    ]);
  });

  it('loads only open requests, and asks for a review', async () => {
    const fetchMock = stubFetch((_url, init) =>
      init?.method === 'POST'
        ? {
            status: 201,
            body: {
              id: REQUEST_ID,
              entryNo: 5,
              subjectType: 'Project',
              subjectNo: 'PR00090',
              weekStart: '2026-10-19',
              status: 'Requested',
            },
          }
        : { status: 200, body: { value: [] } }
    );

    await bcClient.getPlanReviewRequests('Project', ['PR00090'], ['2026-10-19']);
    expect(urlOf(fetchMock)).toContain("and (status eq 'Requested' or status eq 'Running')");

    const created = await bcClient.createPlanReviewRequest('Project', 'PR00090', '2026-10-19');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/planReviewRequests$/);
    expect(JSON.parse(init!.body as string)).toEqual({
      subjectType: 'Project',
      subjectNo: 'PR00090',
      weekStart: '2026-10-19',
    });
    expect(created).toEqual(
      expect.objectContaining({
        id: REQUEST_ID,
        status: 'Requested',
        progress: '',
        errorMessage: '',
      })
    );
  });

  it("applies a finding through BC's bound action, in the company it started in", async () => {
    const fetchMock = stubFetch(() => ({ status: 204, body: '' }));
    await bcClient.applyPlanReviewFinding(FINDING_ID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(
      /\/sandbox\/api\/knowall\/thyme\/v1\.0\/companies\(00000000-0000-0000-0000-0000000000c3\)\/planReviewLines\(00000000-0000-0000-0000-00000000f001\)\/Microsoft\.NAV\.applyChanges$/
    );
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it("passes BC's refusal through as BC's own message", async () => {
    stubFetch(() => ({
      status: 400,
      body: JSON.stringify({
        error: {
          code: 'Application_DialogException',
          message: 'The plan changed since Timmie looked. Ask it to re-review.  CorrelationId: abc',
        },
      }),
    }));
    const error = await bcClient.applyPlanReviewFinding(FINDING_ID).catch((e) => e);
    expect(bcErrorText(error)).toBe('The plan changed since Timmie looked. Ask it to re-review.');
  });

  it('asks for an extension update when the action is missing (404)', async () => {
    stubFetch(() => ({ status: 404, body: 'No HTTP resource was found' }));
    await expect(bcClient.applyPlanReviewFinding(FINDING_ID)).rejects.toThrow(
      'Update the Timmie BC Extension to apply changes'
    );
  });

  it('refuses an id that is not a SystemId', async () => {
    const fetchMock = stubFetch(() => ({ status: 204, body: '' }));
    await expect(bcClient.applyPlanReviewFinding("x')/delete")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
