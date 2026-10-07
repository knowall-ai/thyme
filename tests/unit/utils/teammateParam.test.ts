import { describe, it, expect } from 'vitest';
import {
  isCurrentUserTeammate,
  parseResourceParam,
  resolveTeammateParam,
  withResourceParam,
} from '@/utils/teammateParam';
import type { Teammate } from '@/types';

const teammate = (resourceNo: string, extra: Partial<Teammate> = {}): Teammate => ({
  id: `id-${resourceNo}`,
  resourceNo,
  displayName: `Person ${resourceNo}`,
  ...extra,
});

describe('parseResourceParam', () => {
  it('reads a resource number, normalised to upper case', () => {
    expect(parseResourceParam('R0070')).toBe('R0070');
    expect(parseResourceParam(' r0070 ')).toBe('R0070');
  });

  it('ignores a missing, blank or over-long value', () => {
    expect(parseResourceParam(null)).toBeNull();
    expect(parseResourceParam(undefined)).toBeNull();
    expect(parseResourceParam('   ')).toBeNull();
    expect(parseResourceParam('X'.repeat(21))).toBeNull();
  });
});

describe('withResourceParam', () => {
  it('adds the resource after the existing parameters', () => {
    expect(withResourceParam('?week=2026-09-28', 'R0070')).toBe('?week=2026-09-28&resource=R0070');
    expect(withResourceParam('', 'R0070')).toBe('?resource=R0070');
  });

  it('replaces an existing resource in place', () => {
    expect(withResourceParam('?resource=R0010&week=2026-09-28', 'R0070')).toBe(
      '?resource=R0070&week=2026-09-28'
    );
  });

  it('removes the resource, and the ? when nothing is left', () => {
    expect(withResourceParam('?week=2026-09-28&resource=R0070', null)).toBe('?week=2026-09-28');
    expect(withResourceParam('?resource=R0070', null)).toBe('');
    expect(withResourceParam('', null)).toBe('');
  });

  it('round-trips through parseResourceParam', () => {
    const search = withResourceParam('?week=2026-09-28', 'R0070');
    expect(parseResourceParam(new URLSearchParams(search).get('resource'))).toBe('R0070');
  });
});

describe('isCurrentUserTeammate', () => {
  it('uses the resource match, falling back to email', () => {
    expect(isCurrentUserTeammate(teammate('R1', { isCurrentUser: true }))).toBe(true);
    expect(
      isCurrentUserTeammate(teammate('R1', { email: 'Me@Contoso.com' }), 'me@contoso.com')
    ).toBe(true);
    expect(
      isCurrentUserTeammate(teammate('R1', { email: 'you@contoso.com' }), 'me@contoso.com')
    ).toBe(false);
    expect(isCurrentUserTeammate(teammate('R1'), undefined)).toBe(false);
  });
});

describe('resolveTeammateParam', () => {
  const team = [teammate('R0010', { isCurrentUser: true }), teammate('R0070')];

  it('opens a teammate the picker offers, matching case-insensitively', () => {
    expect(resolveTeammateParam('R0070', team)).toEqual({ kind: 'teammate', teammate: team[1] });
    expect(resolveTeammateParam('r0070', team)).toEqual({ kind: 'teammate', teammate: team[1] });
  });

  it("treats a link to the viewer's own resource as their own timesheet", () => {
    expect(resolveTeammateParam('R0010', team)).toEqual({ kind: 'self' });
  });

  it('falls back with a reason for a resource that is not in the list', () => {
    const result = resolveTeammateParam('R9999', team);
    expect(result.kind).toBe('fallback');
    expect(result.kind === 'fallback' && result.message).toContain('R9999');
  });

  it('falls back with a reason when the team could not be loaded', () => {
    const result = resolveTeammateParam('R0070', [], { loadError: 'Network error' });
    expect(result.kind).toBe('fallback');
    expect(result.kind === 'fallback' && result.message).toMatch(/couldn't load your team/i);
  });
});
