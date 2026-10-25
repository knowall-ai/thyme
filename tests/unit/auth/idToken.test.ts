import { describe, it, expect, vi, beforeEach } from 'vitest';

const { msalMock } = vi.hoisted(() => ({
  msalMock: { getActiveAccount: vi.fn(), acquireTokenSilent: vi.fn() },
}));

vi.mock('@/services/auth/msalInstance', () => ({
  msalInstance: msalMock,
  initializeMsal: vi.fn().mockResolvedValue(undefined),
}));

import { getIdToken, isIdTokenFresh } from '@/services/auth/tokenService';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const secondsFromNow = (s: number) => Math.floor(NOW / 1000) + s;

describe('isIdTokenFresh', () => {
  it('is fresh with more than a minute left', () => {
    expect(isIdTokenFresh({ exp: secondsFromNow(30 * 60) }, NOW)).toBe(true);
  });

  it.each([
    ['expired', { exp: secondsFromNow(-10) }],
    ['about to expire', { exp: secondsFromNow(30) }],
    ['without exp', {}],
    ['without claims', undefined],
  ])('is not fresh when %s', (_label, claims) => {
    expect(isIdTokenFresh(claims, NOW)).toBe(false);
  });
});

describe('getIdToken', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    msalMock.getActiveAccount.mockReturnValue({ homeAccountId: 'a' });
    msalMock.acquireTokenSilent.mockReset();
  });

  it('returns a cached ID token that is still fresh', async () => {
    msalMock.acquireTokenSilent.mockResolvedValue({
      idToken: 'cached',
      idTokenClaims: { exp: secondsFromNow(3600) },
    });
    expect(await getIdToken()).toBe('cached');
    expect(msalMock.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('forces a refresh when MSAL returns an expired ID token', async () => {
    msalMock.acquireTokenSilent
      .mockResolvedValueOnce({ idToken: 'stale', idTokenClaims: { exp: secondsFromNow(-60) } })
      .mockResolvedValueOnce({ idToken: 'fresh', idTokenClaims: { exp: secondsFromNow(3600) } });
    expect(await getIdToken()).toBe('fresh');
    expect(msalMock.acquireTokenSilent).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true })
    );
  });
});
