import { afterEach, describe, expect, it, vi } from 'vitest';
import { authHeaders, resetAuthCache } from '@/services/public-timmie/auth';
import { publicChatRequest } from '@/services/public-timmie/azure';
import { publicTimmieInstructions } from '@/services/public-timmie/prompt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetAuthCache();
});

describe('publicChatRequest', () => {
  it('has no tools, is not stored, and uses the public prompt', () => {
    const body = publicChatRequest('c', [{ role: 'user', content: 'Hi' }]);
    expect(body.tools).toEqual([]);
    expect(body.tool_choice).toBe('none');
    expect(body.store).toBe(false);
    expect(body.instructions).toBe(publicTimmieInstructions('chat'));
    expect(body.max_output_tokens).toBe(1200);
  });
});

describe('Azure credentials', () => {
  it('uses the App Service managed identity first', async () => {
    vi.stubEnv('IDENTITY_ENDPOINT', 'http://127.0.0.1:41000/msi/token');
    vi.stubEnv('IDENTITY_HEADER', 'header-value');
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: 'mi-token', expires_on: String(Date.now() / 1000 + 3600) })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await authHeaders('fallback-key')).toEqual({ Authorization: 'Bearer mi-token' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('resource=https%3A%2F%2Fcognitiveservices.azure.com');
    expect((init.headers as Record<string, string>)['X-IDENTITY-HEADER']).toBe('header-value');
    // Cached until shortly before it expires.
    await authHeaders('fallback-key');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to the API key, and fails without either', async () => {
    vi.stubEnv('IDENTITY_ENDPOINT', '');
    vi.stubEnv('IDENTITY_HEADER', '');
    expect(await authHeaders('fallback-key')).toEqual({ 'api-key': 'fallback-key' });
    await expect(authHeaders(undefined)).rejects.toThrow();
  });

  it('falls back to the key when the identity endpoint fails', async () => {
    vi.stubEnv('IDENTITY_ENDPOINT', 'http://127.0.0.1:41000/msi/token');
    vi.stubEnv('IDENTITY_HEADER', 'h');
    vi.stubGlobal('fetch', async () => new Response('no', { status: 500 }));
    expect(await authHeaders('fallback-key')).toEqual({ 'api-key': 'fallback-key' });
  });
});
