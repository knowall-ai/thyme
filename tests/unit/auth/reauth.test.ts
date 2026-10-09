import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InteractionRequiredAuthError, ServerError, AuthError } from '@azure/msal-browser';

const { msalMock } = vi.hoisted(() => ({
  msalMock: {
    getActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenRedirect: vi.fn(),
  },
}));

vi.mock('@/services/auth/msalInstance', () => ({
  msalInstance: msalMock,
  initializeMsal: vi.fn().mockResolvedValue(undefined),
}));

import {
  AUTO_REDIRECT_COOLDOWN_MS,
  AUTO_REDIRECT_KEY,
  ReauthRequiredError,
  canAutoRedirect,
  isInteractionRequiredError,
  requestReauth,
  resetReauthState,
  signInAgain,
  useReauthStore,
} from '@/services/auth/reauth';
import {
  getAccessToken,
  getGraphAccessToken,
  resetGraphConsentState,
} from '@/services/auth/tokenService';
import { loginRequest } from '@/services/auth/msalConfig';

const account = { username: 'user@contoso.com', homeAccountId: 'home-1' };

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resetReauthState();
  resetGraphConsentState();
  msalMock.getActiveAccount.mockReturnValue(account);
  // A real redirect navigates away and never settles
  msalMock.acquireTokenRedirect.mockReturnValue(new Promise(() => {}));
  window.history.replaceState(null, '', '/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as { opener?: unknown }).opener;
});

describe('isInteractionRequiredError', () => {
  it.each([
    ['InteractionRequiredAuthError', new InteractionRequiredAuthError('login_required')],
    ['interaction_required code', { errorCode: 'interaction_required' }],
    ['consent_required code', { errorCode: 'consent_required' }],
    ['invalid_grant code', new ServerError('invalid_grant', 'AADSTS700084: refresh token expired')],
    ['invalid_grant sub-error', { errorCode: 'server_error', subError: 'invalid_grant' }],
    [
      'AADSTS50076 (MFA)',
      new AuthError('server_error', 'AADSTS50076: Due to a configuration change'),
    ],
    ['AADSTS50079', { message: 'AADSTS50079: user must enroll in MFA' }],
    ['AADSTS50173', { errorMessage: 'AADSTS50173: The provided grant has expired' }],
    ['AADSTS700082', { errorMessage: 'AADSTS700082: The refresh token has expired' }],
    ['AADSTS65001', { errorMessage: 'AADSTS65001: The user has not consented' }],
  ])('treats %s as needing sign-in', (_label, error) => {
    expect(isInteractionRequiredError(error)).toBe(true);
  });

  it.each([
    ['a network failure', new AuthError('no_network_connectivity', 'offline')],
    ['a plain Error', new Error('boom')],
    ['an unrelated AADSTS code', { errorMessage: 'AADSTS50011: redirect URI mismatch' }],
    ['null', null],
    ['a string', 'login_required'],
  ])('does not treat %s as needing sign-in', (_label, error) => {
    expect(isInteractionRequiredError(error)).toBe(false);
  });
});

describe('getAccessToken', () => {
  it('throws ReauthRequiredError and starts a sign-in redirect when interaction is required', async () => {
    msalMock.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('login_required')
    );

    await expect(getAccessToken()).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledTimes(1);
    expect(useReauthStore.getState().status).toBe('redirecting');
  });

  it('returns null without redirecting for other failures', async () => {
    msalMock.acquireTokenSilent.mockRejectedValue(new AuthError('no_network_connectivity'));

    await expect(getAccessToken()).resolves.toBeNull();
    expect(msalMock.acquireTokenRedirect).not.toHaveBeenCalled();
    expect(useReauthStore.getState().status).toBe('idle');
  });

  it('returns the token when silent acquisition works', async () => {
    msalMock.acquireTokenSilent.mockResolvedValue({ accessToken: 'abc' });
    await expect(getAccessToken()).resolves.toBe('abc');
  });
});

describe('single-flight redirect', () => {
  it('starts only one redirect for concurrent BC and Graph callers', async () => {
    msalMock.acquireTokenSilent.mockRejectedValue(
      new ServerError('invalid_grant', 'AADSTS700084: refresh token expired')
    );

    const results = await Promise.allSettled([
      getAccessToken(),
      getAccessToken(),
      getGraphAccessToken(),
      getGraphAccessToken(),
    ]);

    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    // Photos are optional: Graph callers get null and fall back to initials
    expect(results[2]).toEqual({ status: 'fulfilled', value: null });
  });

  it('shares one redirect between automatic and manual sign-in', () => {
    void requestReauth();
    void signInAgain();
    void requestReauth();
    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });
});

describe('URL preservation', () => {
  it('returns to the exact company page, query and hash after signing in', () => {
    window.history.replaceState(
      null,
      '',
      '/sandbox/1234-abcd/time?week=2026-10-05&view=list#today'
    );

    void requestReauth();

    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledWith({
      scopes: loginRequest.scopes,
      account,
      redirectStartPage: `${window.location.origin}/sandbox/1234-abcd/time?week=2026-10-05&view=list#today`,
    });
  });
});

describe('loop guard', () => {
  it('records the redirect time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));

    void requestReauth();

    expect(window.sessionStorage.getItem(AUTO_REDIRECT_KEY)).toBe(
      String(new Date('2026-10-09T10:00:00Z').getTime())
    );
  });

  it('does not redirect again within the cooldown and asks the user instead', () => {
    window.sessionStorage.setItem(AUTO_REDIRECT_KEY, String(Date.now() - 60_000));

    void requestReauth();

    expect(msalMock.acquireTokenRedirect).not.toHaveBeenCalled();
    expect(useReauthStore.getState().status).toBe('manual');
  });

  it('redirects again once the cooldown has passed', () => {
    window.sessionStorage.setItem(
      AUTO_REDIRECT_KEY,
      String(Date.now() - AUTO_REDIRECT_COOLDOWN_MS - 1)
    );

    void requestReauth();

    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('still lets the user sign in manually when the guard has tripped', () => {
    window.sessionStorage.setItem(AUTO_REDIRECT_KEY, String(Date.now()));
    void requestReauth();
    expect(useReauthStore.getState().status).toBe('manual');

    void signInAgain();

    expect(msalMock.acquireTokenRedirect).toHaveBeenCalledTimes(1);
    expect(useReauthStore.getState().status).toBe('redirecting');
  });

  it('never redirects automatically from a popup window', () => {
    Object.defineProperty(window, 'opener', { value: {}, configurable: true, writable: true });

    expect(canAutoRedirect()).toBe(false);
    void requestReauth();
    expect(msalMock.acquireTokenRedirect).not.toHaveBeenCalled();
    expect(useReauthStore.getState().status).toBe('manual');
  });

  it('falls back to the manual prompt if the redirect cannot start', async () => {
    msalMock.acquireTokenRedirect.mockRejectedValue(new AuthError('redirect_failed'));

    await requestReauth();

    expect(useReauthStore.getState().status).toBe('manual');
  });
});
