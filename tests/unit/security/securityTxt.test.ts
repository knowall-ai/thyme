import { readFileSync } from 'fs';
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

describe('public/.well-known/security.txt', () => {
  it('has a Contact', () => {
    expect(field('Contact').length).toBeGreaterThan(0);
    for (const contact of field('Contact')) expect(contact).toMatch(/^(mailto:|https:\/\/)/);
  });

  it('has exactly one Expires, still in the future (renew it before it lapses)', () => {
    const expires = field('Expires');
    expect(expires).toHaveLength(1);
    expect(new Date(expires[0]).getTime()).toBeGreaterThan(Date.now());
  });

  it('is canonical at the production URL', () => {
    expect(field('Canonical')).toContain('https://gettimm.ie/.well-known/security.txt');
  });
});
