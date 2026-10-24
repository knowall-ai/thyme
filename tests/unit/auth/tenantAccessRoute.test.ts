import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tenant-access/route';
import { KNOWALL_TENANT_ID } from '@/utils/tenantAccess';

const CONTOSO = '11111111-2222-3333-4444-555555555555';
const FABRIKAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function ask(tid?: string) {
  const url = new URL('http://localhost/api/tenant-access');
  if (tid !== undefined) url.searchParams.set('tid', tid);
  return GET(new NextRequest(url));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/tenant-access', () => {
  it('approves KnowAll with no APPROVED_TENANT_IDS set', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', '');
    const response = await ask(KNOWALL_TENANT_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: true });
  });

  it('approves a tenant in APPROVED_TENANT_IDS, read at request time', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', `${FABRIKAM}, ${CONTOSO.toUpperCase()}`);
    const response = await ask(CONTOSO);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: true });
  });

  it('is 403 for an unapproved tenant, and never returns the list', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', FABRIKAM);
    const response = await ask(CONTOSO);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ approved: false });
    expect(JSON.stringify(body)).not.toContain(FABRIKAM);
  });

  it('is 401 for a missing or malformed tid', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    for (const tid of [undefined, '', 'common', 'not-a-guid']) {
      const response = await ask(tid);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ approved: false });
    }
  });

  it('is never cached', async () => {
    const response = await ask(KNOWALL_TENANT_ID);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
