import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicClientIp } from '@/services/public-timmie/client-ip';
import {
  frontDoorId,
  powBits,
  publicAzureConfig,
  publicLiveConfig,
  secretProblem,
} from '@/services/public-timmie/config';

afterEach(() => {
  vi.unstubAllEnvs();
});

const h = (init: Record<string, string>) => new Headers(init);

describe('client IP and the Front Door check', () => {
  const FDID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

  it('trusts X-Azure-SocketIP only with our Front Door id', () => {
    expect(
      publicClientIp(
        h({
          'x-azure-fdid': FDID,
          'x-azure-socketip': '198.51.100.7',
          'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        }),
        FDID
      )
    ).toEqual({ ok: true, ip: '198.51.100.7' });
    // Case-insensitive id.
    expect(
      publicClientIp(
        h({ 'x-azure-fdid': FDID.toUpperCase(), 'x-azure-socketip': '198.51.100.7' }),
        FDID
      )
    ).toEqual({ ok: true, ip: '198.51.100.7' });
  });

  it('refuses a request that did not come through our Front Door (403)', () => {
    for (const headers of [
      h({ 'x-azure-socketip': '198.51.100.7' }),
      h({ 'x-azure-fdid': 'another-front-door', 'x-azure-socketip': '198.51.100.7' }),
      h({ 'x-azure-fdid': FDID }),
      h({ 'x-forwarded-for': '198.51.100.7' }),
    ]) {
      expect(publicClientIp(headers, FDID)).toEqual({ ok: false, reason: 'front-door' });
    }
  });

  it('never uses the right-most X-Forwarded-For behind Front Door', () => {
    const result = publicClientIp(
      h({
        'x-azure-fdid': FDID,
        'x-azure-socketip': '198.51.100.7',
        'x-forwarded-for': '198.51.100.7, 147.243.0.1:443',
      }),
      FDID
    );
    expect(result).toEqual({ ok: true, ip: '198.51.100.7' });
  });

  it('without Front Door configured: ignores X-Azure-* and uses the connecting address', () => {
    expect(
      publicClientIp(
        h({ 'x-azure-socketip': '6.6.6.6', 'x-forwarded-for': '6.6.6.6, 203.0.113.9:51234' }),
        undefined
      )
    ).toEqual({ ok: true, ip: '203.0.113.9' });
    expect(publicClientIp(h({ 'x-forwarded-for': '[2001:db8::1]:443' }), undefined)).toEqual({
      ok: true,
      ip: '2001:db8::1',
    });
    expect(publicClientIp(h({}), undefined)).toEqual({ ok: true, ip: 'unknown' });
  });

  it('reads PUBLIC_FRONT_DOOR_ID, or the shared FRONT_DOOR_ID', () => {
    vi.stubEnv('PUBLIC_FRONT_DOOR_ID', '');
    vi.stubEnv('FRONT_DOOR_ID', 'shared-id');
    expect(frontDoorId()).toBe('shared-id');
    vi.stubEnv('PUBLIC_FRONT_DOOR_ID', 'public-id');
    expect(frontDoorId()).toBe('public-id');
  });
});

describe('the signing secret in production', () => {
  it('is refused when missing, short or a placeholder (no silent fallback)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const bad of [
      '',
      'short',
      'change-me',
      'x'.repeat(40),
      'changemechangemechangemechangeme',
    ]) {
      vi.stubEnv('PUBLIC_TIMMIE_SECRET', bad);
      expect(secretProblem(), bad).toBeTruthy();
    }
    vi.stubEnv('PUBLIC_TIMMIE_SECRET', 'Zq8!vR2#mK9$wL4^tY7&pN3*bH6(cJ1)');
    expect(secretProblem()).toBeUndefined();
  });

  it('is not required outside production (development and tests)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PUBLIC_TIMMIE_SECRET', '');
    expect(secretProblem()).toBeUndefined();
  });
});

describe('Azure only', () => {
  it('voice needs Timmie’s Azure endpoint and gpt-live deployment, on the v1 surface', () => {
    vi.stubEnv('PUBLIC_LIVE_ENDPOINT', 'https://timmie-public.openai.azure.com/');
    vi.stubEnv('PUBLIC_LIVE_DEPLOYMENT', 'gpt-live-1');
    vi.stubEnv('PUBLIC_LIVE_API_KEY', 'k');
    expect(publicLiveConfig()).toEqual({
      provider: 'azure',
      base: 'https://timmie-public.openai.azure.com/openai/v1',
      model: 'gpt-live-1',
      apiKey: 'k',
      voice: 'vesper',
    });
  });

  it('never talks to the OpenAI API, whatever the settings say', () => {
    vi.stubEnv('PUBLIC_LIVE_ENDPOINT', 'https://api.openai.com/v1');
    vi.stubEnv('PUBLIC_LIVE_DEPLOYMENT', 'gpt-live-1');
    vi.stubEnv('PUBLIC_LIVE_API_KEY', 'k');
    expect(publicLiveConfig()).toBeUndefined();
    vi.stubEnv('PUBLIC_LIVE_PROVIDER', 'openai');
    expect(publicLiveConfig()).toBeUndefined();
    vi.stubEnv('PUBLIC_AZURE_OPENAI_ENDPOINT', 'https://api.openai.com');
    vi.stubEnv('PUBLIC_AZURE_OPENAI_API_KEY', 'k');
    expect(publicAzureConfig()).toBeUndefined();
  });

  it('fails closed without a deployment, or without managed identity or a key', () => {
    vi.stubEnv('PUBLIC_LIVE_ENDPOINT', 'https://timmie-public.openai.azure.com');
    vi.stubEnv('PUBLIC_LIVE_DEPLOYMENT', '');
    vi.stubEnv('PUBLIC_LIVE_API_KEY', 'k');
    expect(publicLiveConfig()).toBeUndefined();
    vi.stubEnv('PUBLIC_LIVE_DEPLOYMENT', 'gpt-live-1');
    vi.stubEnv('PUBLIC_LIVE_API_KEY', '');
    vi.stubEnv('IDENTITY_ENDPOINT', '');
    expect(publicLiveConfig()).toBeUndefined();
    vi.stubEnv('IDENTITY_ENDPOINT', 'http://127.0.0.1:41000/msi/token');
    vi.stubEnv('IDENTITY_HEADER', 'h');
    expect(publicLiveConfig()?.apiKey).toBeUndefined();
  });

  it('a voice pass needs a harder proof-of-work than a chat pass', () => {
    expect(powBits('chat')).toBe(16);
    expect(powBits('voice')).toBe(18);
    vi.stubEnv('PUBLIC_TIMMIE_VOICE_POW_BITS', '12');
    expect(powBits('voice')).toBe(16); // never easier than chat
  });
});
