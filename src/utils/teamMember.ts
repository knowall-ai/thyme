import type { BCResource } from '@/types';

/**
 * Whether a resource is a person on the team, i.e. someone who can log time: a Person
 * resource that isn't blocked (or privacy-blocked), uses time sheets and has a Time Sheet
 * Owner. Placeholder "role" resources used only for estimates and planning have no time
 * sheet owner, so they can't log time and are left out; real people have one.
 */
export function isTeamMember(resource: BCResource): boolean {
  return (
    resource.type === 'Person' &&
    !resource.blocked &&
    !resource.privacyBlocked &&
    resource.useTimeSheet === true &&
    !!resource.timeSheetOwnerUserId?.trim()
  );
}
