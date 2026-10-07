import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/auth/graphService', () => ({
  getGraphUser: vi.fn(),
  findGraphUsersByDisplayName: vi.fn(),
  getUserProfilePhoto: vi.fn(),
}));

import {
  clearResourceIdentityCache,
  normalizeName,
  resolveResourceIdentity,
  resolveResourceUpn,
} from '@/services/auth/resourceIdentity';
import {
  findGraphUsersByDisplayName,
  getGraphUser,
  getUserProfilePhoto,
} from '@/services/auth/graphService';

const user = (displayName: string, upn: string) => ({
  id: upn,
  displayName,
  userPrincipalName: upn,
});

const lookups = { getGraphUser, findGraphUsersByDisplayName };
const domain = 'contoso.com';

describe('resolveResourceUpn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearResourceIdentityCache();
  });

  it('normalizes case, spaces and punctuation', () => {
    expect(normalizeName(' Alex  Contoso ')).toBe('alexcontoso');
    expect(normalizeName('ALEX.CONTOSO')).toBe('alexcontoso');
  });

  it('uses the owner when the user id matches the resource name, without calling Graph', async () => {
    const upn = await resolveResourceUpn(
      { name: 'Alex Contoso', ownerUserId: 'ALEX.CONTOSO' },
      domain,
      lookups
    );
    expect(upn).toBe('alex.contoso@contoso.com');
    expect(getGraphUser).not.toHaveBeenCalled();
    expect(findGraphUsersByDisplayName).not.toHaveBeenCalled();
  });

  it('uses the owner when their directory name matches, ignoring case and spacing', async () => {
    vi.mocked(getGraphUser).mockResolvedValue(user('alex  CONTOSO', 'acontoso@contoso.com'));
    const upn = await resolveResourceUpn(
      { name: 'Alex Contoso', ownerUserId: 'ACONTOSO' },
      domain,
      lookups
    );
    expect(upn).toBe('acontoso@contoso.com');
    expect(findGraphUsersByDisplayName).not.toHaveBeenCalled();
  });

  it("looks the resource up by name when the owner is someone else (an owner's bot)", async () => {
    vi.mocked(getGraphUser).mockResolvedValue(user('Alex Contoso', 'alex.contoso@contoso.com'));
    vi.mocked(findGraphUsersByDisplayName).mockResolvedValue([
      user('Helper Bot', 'helper.bot@contoso.com'),
    ]);
    const upn = await resolveResourceUpn(
      { name: 'Helper Bot', ownerUserId: 'ALEX.CONTOSO' },
      domain,
      lookups
    );
    expect(upn).toBe('helper.bot@contoso.com');
    expect(findGraphUsersByDisplayName).toHaveBeenCalledWith('Helper Bot');
  });

  it('returns null when the name search finds nobody', async () => {
    vi.mocked(getGraphUser).mockResolvedValue(user('Alex Contoso', 'alex.contoso@contoso.com'));
    vi.mocked(findGraphUsersByDisplayName).mockResolvedValue([]);
    expect(
      await resolveResourceUpn({ name: 'Helper Bot', ownerUserId: 'ALEX.CONTOSO' }, domain, lookups)
    ).toBeNull();
  });

  it('returns null when several users share the name', async () => {
    vi.mocked(findGraphUsersByDisplayName).mockResolvedValue([
      user('Sam Contoso', 'sam1@contoso.com'),
      user('Sam Contoso', 'sam2@contoso.com'),
    ]);
    expect(await resolveResourceUpn({ name: 'Sam Contoso' }, domain, lookups)).toBeNull();
  });

  it('falls back to the name search when the owner has no directory entry', async () => {
    vi.mocked(getGraphUser).mockResolvedValue(null);
    vi.mocked(findGraphUsersByDisplayName).mockResolvedValue([
      user('Sam Contoso', 'sam@contoso.com'),
    ]);
    expect(
      await resolveResourceUpn({ name: 'Sam Contoso', ownerUserId: 'GONE' }, domain, lookups)
    ).toBe('sam@contoso.com');
  });

  it('returns null without a resource name', async () => {
    expect(await resolveResourceUpn({ name: '  ', ownerUserId: 'X' }, domain, lookups)).toBeNull();
  });
});

describe('resolveResourceIdentity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearResourceIdentityCache();
  });

  it("fetches the resolved user's photo and caches per resource", async () => {
    vi.mocked(getUserProfilePhoto).mockResolvedValue('data:image/png;base64,abc');
    const input = { name: 'Alex Contoso', ownerUserId: 'ALEX.CONTOSO' };
    const [a, b] = await Promise.all([
      resolveResourceIdentity(input, domain),
      resolveResourceIdentity(input, domain),
    ]);
    expect(a).toEqual({ upn: 'alex.contoso@contoso.com', photoUrl: 'data:image/png;base64,abc' });
    expect(b).toBe(a);
    await resolveResourceIdentity(input, domain);
    expect(getUserProfilePhoto).toHaveBeenCalledTimes(1);
    expect(getUserProfilePhoto).toHaveBeenCalledWith('alex.contoso@contoso.com', {
      throwOnError: true,
    });
  });

  it('does not cache a transient photo failure', async () => {
    vi.mocked(getUserProfilePhoto).mockRejectedValueOnce(new Error('503'));
    const input = { name: 'Alex Contoso', ownerUserId: 'ALEX.CONTOSO' };
    expect(await resolveResourceIdentity(input, domain)).toEqual({
      upn: null,
      photoUrl: null,
      failed: true,
    });
    vi.mocked(getUserProfilePhoto).mockResolvedValueOnce('data:image/png;base64,abc');
    expect((await resolveResourceIdentity(input, domain)).photoUrl).toBe(
      'data:image/png;base64,abc'
    );
  });

  it('gives no photo and does not cache when Graph fails', async () => {
    vi.mocked(getGraphUser).mockRejectedValue(new Error('offline'));
    const input = { name: 'Helper Bot', ownerUserId: 'ALEX.CONTOSO' };
    expect(await resolveResourceIdentity(input, domain)).toEqual({
      upn: null,
      photoUrl: null,
      failed: true,
    });
    await resolveResourceIdentity(input, domain);
    expect(getGraphUser).toHaveBeenCalledTimes(2);
    expect(getUserProfilePhoto).not.toHaveBeenCalled();
  });
});
