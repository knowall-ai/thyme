import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

const COMPANY_ID = '00000000-0000-0000-0000-0000000000c4';

// A CRONUS UK Ltd.-style project as BC returns it after the insert
const created = {
  '@odata.etag': 'W/"1"',
  id: '00000000-0000-0000-0000-00000000p001',
  number: 'PR00150',
  displayName: 'Contoso website',
  billToCustomerNo: '20000',
  billToCustomerName: 'Trey Research',
  status: 'Open',
  blocked: '_x0020_',
  startingDate: '2026-10-15',
  endingDate: '2026-12-31',
};

/** Routes the POST to `projectResponse`; the company-name lookups get CRONUS's name */
function stubFetch(projectResponse: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const isPost = init?.method === 'POST';
    const status = isPost ? projectResponse.status : 200;
    const body = isPost
      ? projectResponse.body
      : url.endsWith('/companyInformation')
        ? { value: [{ displayName: 'CRONUS UK Ltd.' }] }
        : { name: 'CRONUS UK Ltd.', displayName: 'CRONUS UK Ltd.' };
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

function postCall(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  if (!call) throw new Error('No POST made');
  return { url: call[0], body: JSON.parse(String(call[1]?.body)) };
}

describe('bcClient.createProject', () => {
  beforeEach(() => {
    bcClient.setCompany(COMPANY_ID, 'sandbox');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the project to the Timmie projects API and returns it normalised', async () => {
    const fetchMock = stubFetch({ status: 201, body: created });

    const project = await bcClient.createProject({
      displayName: '  Contoso website ',
      billToCustomerNo: '20000',
      startingDate: '2026-10-15',
      endingDate: '2026-12-31',
    });

    const { url, body } = postCall(fetchMock);
    expect(url).toContain(`/sandbox/api/knowall/thyme/v1.0/companies(${COMPANY_ID})/projects`);
    expect(body).toEqual({
      displayName: 'Contoso website',
      billToCustomerNo: '20000',
      startingDate: '2026-10-15',
      endingDate: '2026-12-31',
    });
    expect(project).toMatchObject({ number: 'PR00150', displayName: 'Contoso website' });
    // BC's encoded blank Blocked value comes back as a plain blank
    expect(project.blocked).toBe(' ');
    expect(project.billToIsCompany).toBeFalsy();
  });

  it('leaves out the customer and dates when not given, so BC numbers an internal project', async () => {
    const fetchMock = stubFetch({
      status: 201,
      body: { ...created, billToCustomerNo: '', billToCustomerName: '' },
    });

    await bcClient.createProject({ displayName: 'Internal training' });

    const { body } = postCall(fetchMock);
    expect(body).toEqual({ displayName: 'Internal training' });
  });

  it("throws BC's error when it refuses the insert", async () => {
    stubFetch({
      status: 403,
      body: { error: { code: 'Forbidden', message: 'No permission' } },
    });

    await expect(bcClient.createProject({ displayName: 'Contoso website' })).rejects.toThrow(
      /BC API Error \(403\)/
    );
  });

  it('rejects a malformed date without calling BC', async () => {
    const fetchMock = stubFetch({ status: 201, body: created });

    await expect(
      bcClient.createProject({ displayName: 'Contoso website', startingDate: '15/10/2026' })
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('refuses a blank name, or one over 100 characters, without calling Business Central', async () => {
    const fetchMock = stubFetch({ status: 201, body: created });
    await expect(bcClient.createProject({ displayName: '   ' })).rejects.toThrow(
      'Project name cannot be empty'
    );
    await expect(bcClient.createProject({ displayName: 'x'.repeat(101) })).rejects.toThrow(
      'cannot be longer than 100 characters'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
