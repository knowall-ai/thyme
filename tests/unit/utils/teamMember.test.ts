import { describe, it, expect } from 'vitest';
import { isTeamMember } from '@/utils/teamMember';
import type { BCResource } from '@/types';

function resource(partial: Partial<BCResource> = {}): BCResource {
  return {
    id: 'r1',
    number: 'RES01',
    name: 'Jane Doe',
    type: 'Person',
    useTimeSheet: true,
    blocked: false,
    privacyBlocked: false,
    timeSheetOwnerUserId: 'JANE.DOE',
    ...partial,
  };
}

describe('isTeamMember', () => {
  it('includes a person who uses time sheets and has an owner', () => {
    expect(isTeamMember(resource())).toBe(true);
  });

  it('leaves out placeholder role resources with no time sheet owner', () => {
    expect(isTeamMember(resource({ name: 'Design Resource', timeSheetOwnerUserId: '' }))).toBe(
      false
    );
    expect(isTeamMember(resource({ timeSheetOwnerUserId: '   ' }))).toBe(false);
    expect(isTeamMember(resource({ timeSheetOwnerUserId: undefined }))).toBe(false);
  });

  it('leaves out blocked and privacy-blocked resources', () => {
    expect(isTeamMember(resource({ blocked: true }))).toBe(false);
    expect(isTeamMember(resource({ privacyBlocked: true }))).toBe(false);
  });

  it('leaves out resources that do not use time sheets', () => {
    expect(isTeamMember(resource({ useTimeSheet: false }))).toBe(false);
    expect(isTeamMember(resource({ useTimeSheet: undefined }))).toBe(false);
  });

  it('leaves out machines', () => {
    expect(isTeamMember(resource({ type: 'Machine' }))).toBe(false);
  });
});
