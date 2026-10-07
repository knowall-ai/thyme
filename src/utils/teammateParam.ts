import type { Teammate } from '@/types';

/**
 * Query parameter holding the teammate whose timesheet is on screen, by BC resource
 * number (`/time?week=2026-09-28&resource=R0070`), so the view survives a refresh and
 * can be shared. Resource numbers are per company, so it's dropped on a company switch.
 */
export const RESOURCE_PARAM = 'resource';

/** BC resource numbers are Code[20]: case-insensitive, at most 20 characters. */
const MAX_RESOURCE_NO_LENGTH = 20;

/** Read the resource number from a `resource=` value, or null if absent or not a valid number. */
export function parseResourceParam(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > MAX_RESOURCE_NO_LENGTH) return null;
  return trimmed.toUpperCase();
}

/**
 * Return `search` (with or without its `?`) with `resource=` set to `resourceNo`, or
 * removed when it's null. Other parameters keep their order. Returns `?a=1&b=2` or ''.
 */
export function withResourceParam(search: string, resourceNo: string | null): string {
  const params = new URLSearchParams(search);
  if (resourceNo) {
    params.set(RESOURCE_PARAM, resourceNo);
  } else {
    params.delete(RESOURCE_PARAM);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Whether `teammate` is the signed-in user (resource match, falling back to email). */
export function isCurrentUserTeammate(teammate: Teammate, currentUserEmail?: string): boolean {
  if (teammate.isCurrentUser) return true;
  const email = currentUserEmail?.toLowerCase();
  return !!email && !!teammate.email && teammate.email.toLowerCase() === email;
}

export type TeammateParamResolution =
  /** Open this teammate's timesheet */
  | { kind: 'teammate'; teammate: Teammate }
  /** The link is to the viewer's own timesheet */
  | { kind: 'self' }
  /** Fall back to the viewer's own timesheet, telling them why */
  | { kind: 'fallback'; message: string };

/**
 * Decide what a `resource=` link opens, once the teammate list has loaded. The list
 * is exactly who the teammate picker offers, so a link can't open anyone the picker
 * wouldn't (e.g. a resource that's blocked, not set up for timesheets, or from
 * another company).
 */
export function resolveTeammateParam(
  resourceNo: string,
  teammates: Teammate[],
  options: { currentUserEmail?: string; loadError?: string | null } = {}
): TeammateParamResolution {
  if (options.loadError) {
    return {
      kind: 'fallback',
      message: `Couldn't load your team, so showing your own timesheet instead of ${resourceNo}'s`,
    };
  }
  const wanted = resourceNo.toUpperCase();
  const teammate = teammates.find((t) => t.resourceNo.toUpperCase() === wanted);
  if (!teammate) {
    return {
      kind: 'fallback',
      message: `Resource ${resourceNo} isn't a teammate you can view in this company, so showing your own timesheet`,
    };
  }
  if (isCurrentUserTeammate(teammate, options.currentUserEmail)) return { kind: 'self' };
  return { kind: 'teammate', teammate };
}
