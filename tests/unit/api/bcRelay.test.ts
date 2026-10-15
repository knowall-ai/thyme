import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/bc/[...path]/route';

const BC = 'https://api.businesscentral.dynamics.com/v2.0';
const path = '/api/bc/tenant/sandbox/api/knowall/thyme/v1.0/companies(c1)/timeSheets';

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; odata.metadata=minimal', etag: 'W/"1"' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Business Central relay', () => {
  it("forwards the path, query and the user's token, and nothing else", async () => {
    const fetchMock = stubFetch({ value: [] });
    const query = '?$filter=startingDate%20ge%202026-10-12';
    const response = await GET(
      new NextRequest(`http://localhost:3000${path}${query}`, {
        headers: { authorization: 'Bearer user-token', cookie: 'session=secret' },
      })
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(`${BC}${path.slice('/api/bc'.length)}${query}`);
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer user-token');
    expect(headers.get('cookie')).toBeNull();
    expect(response.headers.get('etag')).toBe('W/"1"');
  });

  it('points next-page links back at the relay', async () => {
    stubFetch({ value: [1], '@odata.nextLink': `${BC}/tenant/sandbox/api/x?$skiptoken=2` });
    const body = await (await GET(new NextRequest(`http://localhost:3000${path}`))).json();
    expect(body['@odata.nextLink']).toBe('/api/bc/tenant/sandbox/api/x?$skiptoken=2');
  });

  it('passes the method and body of a write through', async () => {
    const fetchMock = stubFetch({ id: 'x' });
    await PATCH(
      new NextRequest(`http://localhost:3000${path}`, {
        method: 'PATCH',
        headers: { 'if-match': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 2 }),
      })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe('PATCH');
    expect((init.headers as Headers).get('if-match')).toBe('*');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"quantity":2}');
  });

  it("won't leave Business Central's API", async () => {
    const fetchMock = stubFetch({});
    for (const escape of ['/api/bc/%2E%2E/%2E%2E/admin', '/api/bc/../../admin', '/api/bc']) {
      const response = await GET(new NextRequest(`http://localhost:3000${escape}`));
      expect(response.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
