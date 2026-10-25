import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { GET } from '@/app/api/tenant-access/route';
import { KNOWALL_TENANT_ID } from '@/utils/tenantAccess';

// Entra's signing keys are replaced by a key generated here
const keys = vi.hoisted(() => ({ jwks: { keys: [] as JWK[] } }));
vi.mock('@/services/auth/idTokenVerifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/auth/idTokenVerifier')>();
  return { ...actual, entraKeySet: () => createLocalJWKSet(keys.jwks) };
});

const CLIENT_ID = '99999999-0000-0000-0000-000000000001';
const CONTOSO = '11111111-2222-3333-4444-555555555555';
const FABRIKAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let signingKey: Key;
let strangerKey: Key;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  strangerKey = (await generateKeyPair('RS256')).privateKey;
  keys.jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] };
});

interface TokenOptions {
  tid?: string;
  iss?: string;
  aud?: string;
  key?: Key;
}

/** An ID token as Entra would issue it for `tid`, with any part overridden */
function idToken({ tid, iss, aud = CLIENT_ID, key }: TokenOptions = {}) {
  const claims: Record<string, unknown> = tid === undefined ? {} : { tid };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss ?? `https://login.microsoftonline.com/${tid ?? 'common'}/v2.0`)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key ?? signingKey);
}

function ask(authorization?: string, query = '') {
  const headers = authorization ? { authorization } : undefined;
  return GET(new NextRequest(`http://localhost/api/tenant-access${query}`, { headers }));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_AZURE_CLIENT_ID', CLIENT_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/tenant-access', () => {
  it('approves KnowAll with no APPROVED_TENANT_IDS set', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', '');
    const response = await ask(`Bearer ${await idToken({ tid: KNOWALL_TENANT_ID })}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: true });
  });

  it('approves a tenant in APPROVED_TENANT_IDS, read at request time', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', `${FABRIKAM}, ${CONTOSO.toUpperCase()}`);
    const response = await ask(`Bearer ${await idToken({ tid: CONTOSO })}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: true });
  });

  it('is 403 for an unapproved tenant, and never returns the list', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', FABRIKAM);
    const response = await ask(`Bearer ${await idToken({ tid: CONTOSO })}`);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ approved: false });
    expect(JSON.stringify(body)).not.toContain(FABRIKAM);
  });

  it('is 403 for a verified token with no tenant', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const response = await ask(`Bearer ${await idToken()}`);
    expect(response.status).toBe(403);
  });

  it('decides from the token, ignoring a ?tid= query', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const response = await ask(`Bearer ${await idToken({ tid: FABRIKAM })}`, `?tid=${CONTOSO}`);
    expect(response.status).toBe(403);
    expect((await ask(undefined, `?tid=${CONTOSO}`)).status).toBe(401);
  });

  it('is 401 with no bearer token', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    for (const header of [undefined, '', 'Basic abc', 'Bearer']) {
      const response = await ask(header);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ approved: false });
    }
  });

  it('is 401 for a token signed by another key', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const response = await ask(`Bearer ${await idToken({ tid: CONTOSO, key: strangerKey })}`);
    expect(response.status).toBe(401);
  });

  it('is 401 for a token issued to another app', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const token = await idToken({ tid: CONTOSO, aud: '99999999-0000-0000-0000-000000000002' });
    expect((await ask(`Bearer ${token}`)).status).toBe(401);
  });

  it("is 401 when the issuer isn't the token's own tenant", async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const token = await idToken({
      tid: CONTOSO,
      iss: `https://login.microsoftonline.com/${FABRIKAM}/v2.0`,
    });
    expect((await ask(`Bearer ${token}`)).status).toBe(401);
  });

  it('is 401 for a token not signed with RS256', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const claims = b64({
      tid: CONTOSO,
      iss: `https://login.microsoftonline.com/${CONTOSO}/v2.0`,
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const signed = `${b64({ alg: 'HS256', kid: 'k1' })}.${claims}`;
    const hs256 = `${signed}.${createHmac('sha256', 'a-shared-secret').update(signed).digest('base64url')}`;
    const unsigned = `${b64({ alg: 'none' })}.${claims}.`;
    for (const token of [hs256, unsigned]) {
      expect((await ask(`Bearer ${token}`)).status).toBe(401);
    }
  });

  it('is 401 for an expired token', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
    const expired = await new SignJWT({ tid: CONTOSO })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://login.microsoftonline.com/${CONTOSO}/v2.0`)
      .setAudience(CLIENT_ID)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
      .sign(signingKey);
    expect((await ask(`Bearer ${expired}`)).status).toBe(401);
  });

  it('is 503 when the server has no client ID to verify against', async () => {
    vi.stubEnv('NEXT_PUBLIC_AZURE_CLIENT_ID', '');
    const response = await ask(`Bearer ${await idToken({ tid: CONTOSO })}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ approved: false });
  });

  it('is never cached', async () => {
    const response = await ask(`Bearer ${await idToken({ tid: KNOWALL_TENANT_ID })}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
