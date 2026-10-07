import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/auth/graphService', () => ({
  findGraphUsersByDisplayNamePrefix: vi.fn(),
  getUserProfilePhoto: vi.fn(),
}));

import {
  clearReviewerPhotoCache,
  resolveReviewerPhoto,
  resolveReviewerUpn,
} from '@/services/auth/reviewerIdentity';
import {
  findGraphUsersByDisplayNamePrefix,
  getUserProfilePhoto,
} from '@/services/auth/graphService';

const user = (displayName: string, upn: string) => ({
  id: upn,
  displayName,
  userPrincipalName: upn,
});

const search = vi.mocked(findGraphUsersByDisplayNamePrefix);
const photo = vi.mocked(getUserProfilePhoto);
const lookups = { findGraphUsersByDisplayNamePrefix };

describe('resolveReviewerUpn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearReviewerPhotoCache();
  });

  it('uses the one user whose name is exactly the reviewer name', async () => {
    search.mockResolvedValue([
      user('Poppie', 'poppie@contoso.com'),
      user('Poppie Contoso', 'poppie.contoso@contoso.com'),
    ]);
    expect(await resolveReviewerUpn('Poppie', lookups)).toBe('poppie@contoso.com');
    expect(search).toHaveBeenCalledWith('Poppie');
  });

  it('uses the one user whose name starts with the reviewer name as a whole word', async () => {
    search.mockResolvedValue([
      user('Poppie Contoso', 'poppie.contoso@contoso.com'),
      user('Poppies Florist', 'florist@contoso.com'),
    ]);
    expect(await resolveReviewerUpn('poppie', lookups)).toBe('poppie.contoso@contoso.com');
  });

  it('returns null when several users could be the reviewer', async () => {
    search.mockResolvedValue([
      user('Poppie Contoso', 'poppie.contoso@contoso.com'),
      user('Poppie Fabrikam', 'poppie.fabrikam@contoso.com'),
    ]);
    expect(await resolveReviewerUpn('Poppie', lookups)).toBeNull();
  });

  it('returns null when several users have exactly the reviewer name', async () => {
    search.mockResolvedValue([user('Poppie', 'a@contoso.com'), user('Poppie', 'b@contoso.com')]);
    expect(await resolveReviewerUpn('Poppie', lookups)).toBeNull();
  });

  it('returns null when only a longer word matches', async () => {
    search.mockResolvedValue([user('Samantha Contoso', 'samantha@contoso.com')]);
    expect(await resolveReviewerUpn('Sam', lookups)).toBeNull();
  });

  it('returns null without searching for a blank reviewer', async () => {
    expect(await resolveReviewerUpn('  ', lookups)).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});

describe('resolveReviewerPhoto', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearReviewerPhotoCache();
  });

  it("returns the resolved user's photo and caches it per reviewer name", async () => {
    search.mockResolvedValue([user('Poppie Contoso', 'poppie@contoso.com')]);
    photo.mockResolvedValue('data:image/jpeg;base64,abc');

    expect(await resolveReviewerPhoto('Poppie')).toBe('data:image/jpeg;base64,abc');
    expect(await resolveReviewerPhoto(' poppie ')).toBe('data:image/jpeg;base64,abc');
    expect(photo).toHaveBeenCalledWith('poppie@contoso.com', { throwOnError: true });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('falls back to null when the reviewer is ambiguous, without fetching a photo', async () => {
    search.mockResolvedValue([
      user('Poppie A', 'a@contoso.com'),
      user('Poppie B', 'b@contoso.com'),
    ]);
    expect(await resolveReviewerPhoto('Poppie')).toBeNull();
    expect(photo).not.toHaveBeenCalled();
  });

  it('falls back to null when Graph fails, and retries next time', async () => {
    search.mockRejectedValueOnce(new Error('offline'));
    expect(await resolveReviewerPhoto('Poppie')).toBeNull();

    search.mockResolvedValue([user('Poppie Contoso', 'poppie@contoso.com')]);
    photo.mockResolvedValue('data:image/png;base64,xyz');
    expect(await resolveReviewerPhoto('Poppie')).toBe('data:image/png;base64,xyz');
    expect(search).toHaveBeenCalledTimes(2);
  });
});
