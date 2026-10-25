import { describe, it, expect } from 'vitest';
import { buildCsp, isInvalidCompanyPath } from '@/proxy';

describe('buildCsp', () => {
  // MSAL keeps tokens in localStorage (msalConfig.ts), so this exact policy is what stops
  // injected scripts reading them: don't relax this test to make a change pass
  it('allows scripts only by nonce in production', () => {
    const csp = buildCsp('abc123', false);
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it("adds 'unsafe-eval' only in development", () => {
    expect(buildCsp('n', true)).toContain("'unsafe-eval'");
    expect(buildCsp('n', false)).not.toContain("'unsafe-eval'");
  });

  it('lets the browser reach Entra ID, Graph and Business Central', () => {
    const connectSrc = buildCsp('n', false)
      .split('; ')
      .find((d) => d.startsWith('connect-src'));
    expect(connectSrc).toContain('https://login.microsoftonline.com');
    expect(connectSrc).toContain('https://graph.microsoft.com');
    expect(connectSrc).toContain('https://api.businesscentral.dynamics.com');
  });
});

describe('isInvalidCompanyPath', () => {
  const guid = '00000000-0000-0000-0000-000000000001';

  it.each([
    '/foo/bar',
    '/help/nonexistent',
    '/production/not-a-guid',
    '/staging/' + guid + '/time',
  ])('404s %s', (path) => {
    expect(isInvalidCompanyPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/help',
    '/time',
    `/production/${guid}`,
    `/Sandbox/${guid}/projects/PR00100`,
    '/projects/PR00100',
    '/api/health/bc',
    '/_next/static/chunk.js',
    '/screenshots/dashboard.png',
    '/.well-known/security.txt',
    '/security.txt',
  ])('leaves %s alone', (path) => {
    expect(isInvalidCompanyPath(path)).toBe(false);
  });
});
