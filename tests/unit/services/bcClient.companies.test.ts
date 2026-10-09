import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/auth', () => ({
  getBCAccessToken: vi.fn().mockResolvedValue('token'),
}));

import { bcClient } from '@/services/bc/bcClient';
import { getBCAccessToken } from '@/services/auth';
import { ReauthRequiredError } from '@/services/auth/reauthErrors';

const contoso = { id: '00000000-0000-0000-0000-000000000001', name: 'Contoso', displayName: '' };

// Answer each environment's /companies request with the given status
function respondByEnvironment(statuses: Record<'sandbox' | 'production', number>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const status = url.includes('/sandbox/') ? statuses.sandbox : statuses.production;
      return {
        ok: status === 200,
        status,
        json: async () => ({ value: [contoso] }),
        text: async () => 'error',
      };
    })
  );
}

describe('bcClient.getAllCompanies', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tags companies with their environment', async () => {
    respondByEnvironment({ sandbox: 404, production: 200 });

    const { companies, failedEnvironments } = await bcClient.getAllCompanies();

    expect(companies).toEqual([{ ...contoso, displayName: 'Contoso', environment: 'production' }]);
    expect(failedEnvironments).toEqual([]);
  });

  it('treats 403 (no access) and 404 (no environment) as having no companies there', async () => {
    respondByEnvironment({ sandbox: 403, production: 404 });

    const { companies, failedEnvironments } = await bcClient.getAllCompanies();

    expect(companies).toEqual([]);
    expect(failedEnvironments).toEqual([]);
  });

  it('reports 401 and server errors as failed environments so they can be retried', async () => {
    respondByEnvironment({ sandbox: 401, production: 500 });

    const { failedEnvironments } = await bcClient.getAllCompanies();

    expect(failedEnvironments).toEqual(['sandbox', 'production']);
  });

  it('rethrows an expired sign-in instead of reporting failed environments', async () => {
    respondByEnvironment({ sandbox: 200, production: 200 });
    vi.mocked(getBCAccessToken).mockRejectedValueOnce(new ReauthRequiredError());

    await expect(bcClient.getAllCompanies()).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});
