import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';

const msal = vi.hoisted(() => ({
  acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'real-token' }),
  getActiveAccount: vi.fn(() => ({ homeAccountId: 'real', username: 'someone@example.com' })),
}));

vi.mock('@/services/auth/msalInstance', () => ({
  msalInstance: {
    acquireTokenSilent: msal.acquireTokenSilent,
    getActiveAccount: msal.getActiveAccount,
    acquireTokenRedirect: vi.fn(),
  },
  initializeMsal: vi.fn().mockResolvedValue(undefined),
}));

import {
  DEMO_ACCESS_TOKEN,
  DEMO_COMPANY_ID,
  DEMO_ENVIRONMENT,
  DEMO_FLAG_KEY,
  DEMO_USER,
  clearDemoState,
  enableDemoMode,
  isDemoCompany,
  isDemoMode,
} from '@/services/demo/demoMode';
import { appStorage } from '@/services/demo/demoStorage';
import { resetDemoBcServer } from '@/services/demo/demoBcServer';
import { getBCAccessToken, getGraphAccessToken } from '@/services/auth/tokenService';
import { getIdToken } from '@/services/auth/tokenService';
import { getLicenceToken } from '@/services/auth/licenceService';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useAuth } from '@/services/auth';
import { bcClient } from '@/services/bc/bcClient';

describe('demo mode switch', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetDemoBcServer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('is off until switched on for the tab, and exiting clears everything it kept', () => {
    expect(isDemoMode()).toBe(false);
    sessionStorage.setItem('unrelated', 'kept');

    expect(enableDemoMode()).toBe(true);
    expect(isDemoMode()).toBe(true);
    appStorage().setItem('timmie-settings-storage', '{}');

    clearDemoState();
    expect(isDemoMode()).toBe(false);
    expect(sessionStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('unrelated')).toBe('kept');
  });

  it('recognises the demo company in a link', () => {
    expect(isDemoCompany(DEMO_COMPANY_ID.toUpperCase())).toBe(true);
    expect(isDemoCompany('00000000-0000-0000-0000-000000000001')).toBe(false);
  });

  it("keeps the demo's preferences out of localStorage", () => {
    enableDemoMode();
    appStorage().setItem('timmie_selected_company_id', DEMO_COMPANY_ID);
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(appStorage().getItem('timmie_selected_company_id')).toBe(DEMO_COMPANY_ID);

    clearDemoState();
    expect(appStorage()).toBe(window.localStorage);
  });

  it('never asks Microsoft Entra for a token in the demo', async () => {
    enableDemoMode();
    expect(await getBCAccessToken()).toBe(DEMO_ACCESS_TOKEN);
    expect(await getGraphAccessToken()).toBeNull();
    expect(await getIdToken()).toBeNull();
    expect(await getLicenceToken()).toBeNull();
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('uses the real sign-in outside the demo', async () => {
    expect(await getBCAccessToken()).toBe('real-token');
    expect(msal.acquireTokenSilent).toHaveBeenCalled();
  });

  it('answers Business Central calls in the browser in the demo, sending nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    enableDemoMode();
    bcClient.setCompany(DEMO_COMPANY_ID, DEMO_ENVIRONMENT);

    const projects = await bcClient.getProjects();
    const resource = await bcClient.getResourceByEmail(DEMO_USER.username);

    expect(projects.map((p) => p.displayName)).toContain('ERP Rollout Phase 2');
    expect(resource?.name).toBe(DEMO_USER.name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('goes to Business Central as usual outside the demo', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ value: [] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await bcClient.getCompanies();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('api.businesscentral.dynamics.com'),
      expect.anything()
    );
  });

  it('signs in the fictional demo user, without touching the Microsoft account', () => {
    enableDemoMode();
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.account?.username).toBe(DEMO_USER.username);

    render(
      <>
        <AuthenticatedTemplate>signed in</AuthenticatedTemplate>
        <UnauthenticatedTemplate>signed out</UnauthenticatedTemplate>
      </>
    );
    expect(screen.getByText('signed in')).toBeInTheDocument();
    expect(screen.queryByText('signed out')).toBeNull();
  });

  it('leaves the real sign-in state alone outside the demo', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.account).toBeNull();
  });
});
