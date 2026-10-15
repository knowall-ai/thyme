import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/services/auth/msalInstance', () => ({
  msalInstance: { getActiveAccount: () => null },
  initializeMsal: async () => undefined,
}));

import { getLicensedUsers } from '@/services/auth/licenceService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('licenceService paging', () => {
  it('fails rather than return part of a directory too big to page through', async () => {
    // Every page links to another: more pages than the service will follow
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          value: [
            {
              id: 'u',
              displayName: 'Alex Contoso',
              userPrincipalName: 'alex@contoso.com',
              accountEnabled: true,
              assignedLicenses: [{ skuId: 'e3' }],
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=next',
        })
      )
    );
    await expect(getLicensedUsers('token')).rejects.toThrow('more than 20 pages');
  });
});
