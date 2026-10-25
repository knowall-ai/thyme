import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NextRequest } from 'next/server';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { GET } from '@/app/api/tenant-access/route';
import { KNOWALL_TENANT_ID } from '@/utils/tenantAccess';
import { resetTenantAccessCache } from '@/components/access/useTenantAccess';

const CONTOSO = '11111111-2222-3333-4444-555555555555';
const FABRIKAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const URL_COMPANY = '00000000-0000-0000-0000-000000000001';
const OTHER_COMPANY = '00000000-0000-0000-0000-000000000002';

// The signed-in account (MSAL's AccountInfo, as far as Timmie reads it)
const auth = vi.hoisted(() => ({
  account: null as null | { username: string; idTokenClaims: Record<string, unknown> },
  logout: vi.fn(),
}));

vi.mock('@/services/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/auth')>()),
  useAuth: () => ({
    isAuthenticated: !!auth.account,
    isLoading: false,
    account: auth.account,
    login: vi.fn(),
    logout: auth.logout,
  }),
  AuthenticatedTemplate: ({ children }: { children: ReactNode }) =>
    auth.account ? children : null,
  UnauthenticatedTemplate: ({ children }: { children: ReactNode }) =>
    auth.account ? null : children,
}));

// Entra's side of the approval check: MSAL hands out an ID token for the signed-in
// account's tenant, signed with a key generated here instead of Entra's
const CLIENT_ID = '99999999-0000-0000-0000-000000000001';
const entra = vi.hoisted(() => ({
  jwks: { keys: [] as JWK[] },
  sign: null as null | ((tid: unknown) => Promise<string>),
}));
vi.mock('@/services/auth/idTokenVerifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/auth/idTokenVerifier')>()),
  entraKeySet: () => createLocalJWKSet(entra.jwks),
}));
vi.mock('@/services/auth/tokenService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/auth/tokenService')>()),
  getIdToken: vi.fn(async () =>
    auth.account && entra.sign ? entra.sign(auth.account.idTokenClaims.tid) : null
  ),
}));

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  entra.jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] };
  entra.sign = (tid) =>
    new SignJWT({ tid })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://login.microsoftonline.com/${String(tid).toLowerCase()}/v2.0`)
      .setAudience(CLIENT_ID)
      .setExpirationTime('1h')
      .sign(privateKey);
});

// The organisation name lookup goes to Microsoft Graph; the approval check stays real
vi.mock('@/services/auth/tenantAccessService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/auth/tenantAccessService')>()),
  getOrganisationName: vi.fn(async () => 'Contoso Ltd'),
}));

// The company list (the first Business Central data a signed-in user loads)
const store = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  fetchCompanies: vi.fn(),
}));
vi.mock('@/hooks', () => {
  const useCompanyStore = Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) =>
      selector ? selector(store.state) : store.state,
    { getState: () => store.state }
  );
  return {
    useCompanyStore,
    useCompanyPath: () => (path: string) => path,
    switchCompany: vi.fn(),
    confirmDiscardRunningTimer: () => true,
  };
});
vi.mock('@/services/bc/bcClient', () => ({
  bcClient: { companyId: '', environment: 'production' },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/landing/LandingPage', () => ({
  LandingPage: () => <div>Landing page</div>,
}));

import { CompanyRouteGate } from '@/components/layout/CompanyRouteGate';

function signIn(tid: unknown) {
  auth.account = {
    username: 'alex@contoso.com',
    idTokenClaims: tid === undefined ? {} : { tid },
  };
}

function renderCompanyPage() {
  return render(
    <CompanyRouteGate environment="production" companyId={URL_COMPANY}>
      <div>Timesheet data</div>
    </CompanyRouteGate>
  );
}

let fetchMock: Mock<[string, RequestInit?], Promise<Response>>;

beforeEach(() => {
  resetTenantAccessCache();
  auth.account = null;
  store.fetchCompanies.mockReset();
  // The user has the URL's company, and it's active
  store.state = {
    companies: [{ id: URL_COMPANY, environment: 'production', displayName: 'CRONUS UK Ltd.' }],
    companiesLoaded: true,
    failedEnvironments: [],
    selectedCompany: { id: URL_COMPANY, environment: 'production', displayName: 'CRONUS UK Ltd.' },
    isLoading: false,
    error: null,
    reauthRequired: false,
    fetchCompanies: store.fetchCompanies,
  };
  vi.stubEnv('APPROVED_TENANT_IDS', CONTOSO);
  vi.stubEnv('NEXT_PUBLIC_AZURE_CLIENT_ID', CLIENT_ID);
  // The browser's call to /api/tenant-access goes to the real route handler
  fetchMock = vi.fn(async (input: string, init?: RequestInit) =>
    GET(new NextRequest(new URL(input, 'http://localhost'), { headers: init?.headers }))
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('TenantGate on company pages', () => {
  it('lets a KnowAll user (or guest in the KnowAll tenant) straight in', () => {
    signIn(KNOWALL_TENANT_ID);
    renderCompanyPage();
    expect(screen.getByText('Timesheet data')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets an approved tenant in once the server approves it', async () => {
    signIn(CONTOSO.toUpperCase());
    renderCompanyPage();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
    expect(await screen.findByText('Timesheet data')).toBeInTheDocument();
    // It sends the ID token for the server to verify, not the tenant ID
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tenant-access',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: expect.stringMatching(/^Bearer ey/) },
      })
    );
  });

  it('shows an unapproved tenant the not-set-up page, and loads no data', async () => {
    signIn(FABRIKAM);
    store.state = { ...store.state, companiesLoaded: false };
    renderCompanyPage();

    expect(
      await screen.findByRole('heading', { name: /isn.t set up on Timmie yet/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
    // Not even the company list is asked for
    expect(store.fetchCompanies).not.toHaveBeenCalled();

    // Two ways to get in touch: the pre-filled request, and the plain address
    const request = screen.getByRole('link', { name: /Request access/ });
    const href = new URL(request.getAttribute('href')!);
    expect(href.pathname).toBe('hello@knowall.ai');
    expect(href.searchParams.get('subject')).toBe('Timmie access request');
    expect(href.searchParams.get('body')).toContain(`Tenant ID: ${FABRIKAM}`);
    expect(href.searchParams.get('body')).toContain('Email: alex@contoso.com');
    // The organisation's name, once Graph answers, goes on the page and in the request
    expect(await screen.findByText('Contoso Ltd')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        new URL(
          screen.getByRole('link', { name: /Request access/ }).getAttribute('href')!
        ).searchParams.get('body')
      ).toContain('Organisation: Contoso Ltd')
    );
    expect(screen.getByRole('link', { name: 'hello@knowall.ai' })).toHaveAttribute(
      'href',
      'mailto:hello@knowall.ai'
    );
    expect(screen.getByText(FABRIKAM)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('blocks a sign-in with no tid, without asking the server', async () => {
    signIn(undefined);
    store.state = { ...store.state, companiesLoaded: false };
    renderCompanyPage();
    expect(screen.getByRole('heading', { name: /isn.t set up on Timmie yet/ })).toBeInTheDocument();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/tenant-access'),
      expect.anything()
    );
    expect(store.fetchCompanies).not.toHaveBeenCalled();
    expect(await screen.findByText('Contoso Ltd')).toBeInTheDocument();
  });

  it('blocks a malformed tid rather than falling back to a default tenant', async () => {
    signIn('common');
    renderCompanyPage();
    expect(screen.getByRole('heading', { name: /isn.t set up on Timmie yet/ })).toBeInTheDocument();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
    expect(screen.getByText('Tenant ID:').nextSibling).toHaveTextContent('Unknown');
    expect(await screen.findByText('Contoso Ltd')).toBeInTheDocument();
  });

  it('offers a retry, not "not set up", when the check itself fails', async () => {
    signIn(CONTOSO);
    fetchMock.mockImplementation(async () => new Response('down', { status: 502 }));
    renderCompanyPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
  });

  it("still applies per-user rules: an approved user can't open a company they don't have", async () => {
    signIn(CONTOSO);
    store.state = {
      ...store.state,
      companies: [{ id: OTHER_COMPANY, environment: 'production', displayName: 'Other' }],
      selectedCompany: { id: OTHER_COMPANY, environment: 'production', displayName: 'Other' },
    };
    renderCompanyPage();
    expect(
      await screen.findByRole('heading', { name: /You don.t have access to that company/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Timesheet data')).not.toBeInTheDocument();
  });

  it('shows the landing page, not the gate, when signed out', () => {
    renderCompanyPage();
    expect(screen.getByText('Landing page')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
