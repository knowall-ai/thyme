import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, it, expect } from 'vitest';

// RFC 9116: https://www.rfc-editor.org/rfc/rfc9116
const file = readFileSync(
  path.resolve(__dirname, '../../../public/.well-known/security.txt'),
  'utf8'
);

function field(name: string): string[] {
  return file
    .split('\n')
    .filter((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    .map((line) => line.slice(name.length + 1).trim());
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('public/.well-known/security.txt', () => {
  it('has a Contact', () => {
    expect(field('Contact').length).toBeGreaterThan(0);
    for (const contact of field('Contact')) expect(contact).toMatch(/^(mailto:|https:\/\/)/);
  });

  // Backstop only: the scheduled security-txt-expiry workflow opens a renewal issue 60 days ahead
  it('has exactly one Expires, in the future and less than a year away (RFC 9116 §2.5.5)', () => {
    const expires = field('Expires');
    expect(expires).toHaveLength(1);
    const expiresAt = new Date(expires[0]).getTime();
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThan(Date.now() + 366 * DAY_MS);
  });

  it('is canonical at both production hosts', () => {
    expect(field('Canonical')).toEqual(
      expect.arrayContaining([
        'https://gettimm.ie/.well-known/security.txt',
        'https://timmie.knowall.ai/.well-known/security.txt',
      ])
    );
  });

  it("points Policy at Timmie's own SECURITY.md", () => {
    expect(field('Policy')).toEqual(['https://github.com/knowall-ai/timmie/blob/main/SECURITY.md']);
  });
});

describe('/security.txt', () => {
  it('permanently redirects to /.well-known/security.txt', async () => {
    const nextConfig = createRequire(import.meta.url)('../../../next.config.js');
    const redirects = await nextConfig.redirects();
    expect(redirects).toContainEqual({
      source: '/security.txt',
      destination: '/.well-known/security.txt',
      permanent: true,
    });
  });
});
