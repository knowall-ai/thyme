import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { GET, PUT } from '@/app/api/org-settings/route';
import {
  getOrgSettingsStore,
  memoryOrgSettingsStore,
  unconfiguredOrgSettingsStore,
  setOrgSettingsStore,
  type OrgSettingsStore,
} from '@/services/settings/orgSettingsStore';
import { KNOWALL_TENANT_ID } from '@/utils/tenantAccess';
import { TIMMIE_ADMIN_ROLE, TIMMIE_AGENT } from '@/utils/agentSettings';

// Entra's signing keys are replaced by a key generated here
const keys = vi.hoisted(() => ({ jwks: { keys: [] as JWK[] } }));
vi.mock('@/services/auth/idTokenVerifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/auth/idTokenVerifier')>();
  return { ...actual, entraKeySet: () => createLocalJWKSet(keys.jwks) };
});

const CLIENT_ID = '99999999-0000-0000-0000-000000000001';
const CONTOSO = '11111111-2222-3333-4444-555555555555';
const FABRIKAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let signingKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let store: OrgSettingsStore;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  keys.jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] };
});

/** An ID token as Entra would issue it, with app roles if given */
function idToken(tid: string, roles?: string[]) {
  return new SignJWT({ tid, preferred_username: 'alex@contoso.com', ...(roles && { roles }) })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey);
}

async function get(token?: string) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return GET(new NextRequest('http://localhost/api/org-settings', { headers }));
}

async function put(token: string, body: unknown) {
  return PUT(
    new NextRequest('http://localhost/api/org-settings', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const CUSTOM_AGENT = { kind: 'custom', name: 'Poppie' };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_AZURE_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
  store = memoryOrgSettingsStore();
  setOrgSettingsStore(store);
});

afterEach(() => {
  vi.unstubAllEnvs();
  setOrgSettingsStore(null);
});

describe('GET /api/org-settings', () => {
  it("defaults to Timmie's agent, and says a non-admin can't edit", async () => {
    const response = await get(await idToken(CONTOSO));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ agent: TIMMIE_AGENT, canEdit: false, canSave: true });
  });

  it("returns the organisation's own agent, and canEdit for admins", async () => {
    await store.setAgent(CONTOSO, { kind: 'custom', name: 'Poppie' }, 'x');
    const response = await get(await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]));
    expect(await response.json()).toEqual({ agent: CUSTOM_AGENT, canEdit: true, canSave: true });
  });

  it("never returns another organisation's settings", async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', `${CONTOSO},${FABRIKAM}`);
    await store.setAgent(FABRIKAM, { kind: 'custom', name: 'Fabbot' }, 'x');
    const response = await get(await idToken(CONTOSO));
    expect((await response.json()).agent).toEqual(TIMMIE_AGENT);
  });

  it('refuses a missing token (401) and an unapproved organisation (403)', async () => {
    expect((await get()).status).toBe(401);
    expect((await get(await idToken(FABRIKAM))).status).toBe(403);
  });

  it('serves KnowAll, which is always approved', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', '');
    expect((await get(await idToken(KNOWALL_TENANT_ID))).status).toBe(200);
  });

  it('answers 503 when the store fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setOrgSettingsStore({
      writable: true,
      getAgent: () => Promise.reject(new Error('table down')),
      setAgent: () => Promise.reject(new Error('table down')),
    });
    expect((await get(await idToken(CONTOSO))).status).toBe(503);
  });
});

describe('PUT /api/org-settings', () => {
  it('lets an admin choose their own agent', async () => {
    const response = await put(await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]), {
      agent: { kind: 'custom', name: '  Poppie  ' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agent: CUSTOM_AGENT, canEdit: true, canSave: true });
    expect(await store.getAgent(CONTOSO)).toEqual(CUSTOM_AGENT);
  });

  it("switches back to Timmie's agent, whatever name is sent", async () => {
    await store.setAgent(CONTOSO, { kind: 'custom', name: 'Poppie' }, 'x');
    const token = await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]);
    await put(token, { agent: { kind: 'timmie', name: 'Mallory' } });
    expect(await store.getAgent(CONTOSO)).toEqual(TIMMIE_AGENT);
  });

  it('refuses a user without the Timmie.Admin role', async () => {
    const response = await put(await idToken(CONTOSO, ['Something.Else']), { agent: CUSTOM_AGENT });
    expect(response.status).toBe(403);
    expect(await store.getAgent(CONTOSO)).toBeNull();
  });

  it.each([
    ['an empty name', { agent: { kind: 'custom', name: '   ' } }],
    ['markup in the name', { agent: { kind: 'custom', name: '<img src=x>' } }],
    ['an unknown kind', { agent: { kind: 'robot', name: 'Poppie' } }],
    ['no agent', {}],
    ['malformed JSON', '{nope'],
  ])('refuses %s with 400', async (_label, body) => {
    const response = await put(await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]), body);
    expect(response.status).toBe(400);
  });
});

describe('without settings storage (production, no ORG_SETTINGS_TABLE_ENDPOINT)', () => {
  beforeEach(() => setOrgSettingsStore(unconfiguredOrgSettingsStore()));

  it("gives Timmie's agent and says settings can't be saved", async () => {
    const response = await get(await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]));
    expect(await response.json()).toEqual({ agent: TIMMIE_AGENT, canEdit: true, canSave: false });
  });

  it('refuses to save', async () => {
    const response = await put(await idToken(CONTOSO, [TIMMIE_ADMIN_ROLE]), {
      agent: CUSTOM_AGENT,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'settings_not_configured' });
  });

  it('is what a production server without the setting uses', () => {
    setOrgSettingsStore(null);
    vi.stubEnv('ORG_SETTINGS_TABLE_ENDPOINT', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getOrgSettingsStore().writable).toBe(false);
    setOrgSettingsStore(null);
    vi.stubEnv('NODE_ENV', 'development');
    expect(getOrgSettingsStore().writable).toBe(true);
  });
});
