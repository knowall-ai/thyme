import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';

const COMPANY_ID = '00000000-0000-0000-0000-0000000000c1';

const projects = [
  {
    id: 'p1',
    number: 'PR00010',
    displayName: 'Admin',
    billToCustomerNo: 'C1',
    billToCustomerName: 'CRONUS UK Ltd.',
  },
  {
    id: 'p2',
    number: 'PR00020',
    displayName: 'Website',
    billToCustomerNo: 'C2',
    billToCustomerName: 'Contoso Ltd',
  },
];

type Responder = (url: string) => { status: number; body?: unknown };

function stubFetch(respond: Responder) {
  const fetchMock = vi.fn(async (url: string) => {
    const { status, body } = respond(url);
    return {
      ok: status === 200,
      status,
      json: async () => body,
      text: async () => 'error',
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The standard company record, its Company Information, and the extension's /projects
function bcResponses(companyStatus = 200): Responder {
  return (url) => {
    if (url.includes('/projects')) return { status: 200, body: { value: projects } };
    if (url.includes('/companyInformation'))
      return { status: 200, body: { value: [{ displayName: 'CRONUS UK Ltd.' }] } };
    if (url.endsWith(`companies(${COMPANY_ID})`))
      return {
        status: companyStatus,
        body: { name: 'CRONUS UK Ltd.', displayName: 'CRONUS UK Ltd.' },
      };
    return { status: 404 };
  };
}

describe('bcClient project bill-to company flag', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    bcClient.setCompany(COMPANY_ID, 'sandbox');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // A different company next time, so each test fetches the names afresh
    bcClient.setCompany('00000000-0000-0000-0000-000000000000', 'sandbox');
  });

  it('flags projects billed to a customer named after the company', async () => {
    stubFetch(bcResponses());

    const loaded = await bcClient.getProjects();

    expect(loaded.find((p) => p.number === 'PR00010')?.billToIsCompany).toBe(true);
    expect(loaded.find((p) => p.number === 'PR00020')?.billToIsCompany).toBeUndefined();
  });

  it("uses Company Information when the company record can't be read", async () => {
    stubFetch(bcResponses(500));

    const loaded = await bcClient.getProjects();

    expect(loaded.find((p) => p.number === 'PR00010')?.billToIsCompany).toBe(true);
  });

  it('looks the company names up once per company', async () => {
    const fetchMock = stubFetch(bcResponses());

    await bcClient.getProjects();
    await bcClient.getProjects();

    const nameLookups = fetchMock.mock.calls.filter(([url]) => !String(url).includes('/projects'));
    expect(nameLookups).toHaveLength(2);
  });

  it("still loads projects when the names can't be looked up", async () => {
    stubFetch((url) =>
      url.includes('/projects') ? { status: 200, body: { value: projects } } : { status: 500 }
    );

    const loaded = await bcClient.getProjects();

    expect(loaded).toHaveLength(2);
    expect(loaded.every((p) => !p.billToIsCompany)).toBe(true);
  });
});
