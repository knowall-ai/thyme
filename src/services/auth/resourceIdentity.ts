'use client';

import { findGraphUsersByDisplayName, getGraphUser, getUserProfilePhoto } from './graphService';

export interface ResourceIdentityInput {
  /** Resource name, e.g. "Alex Contoso" */
  name?: string | null;
  /** BC Time Sheet Owner User ID ("ALEX.CONTOSO") or an already-complete UPN */
  ownerUserId?: string | null;
}

export interface ResourceIdentity {
  upn: string | null;
  photoUrl: string | null;
}

interface GraphLookups {
  getGraphUser: typeof getGraphUser;
  findGraphUsersByDisplayName: typeof findGraphUsersByDisplayName;
}

/** Lower-cases and strips spaces and punctuation so "Alex Contoso" equals "alex.contoso". */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function ownerUpn(ownerUserId: string | null | undefined, emailDomain: string): string | null {
  const owner = ownerUserId?.trim();
  if (!owner) return null;
  if (owner.includes('@')) return owner.toLowerCase();
  return emailDomain ? `${owner.toLowerCase()}@${emailDomain}` : null;
}

/**
 * Works out which directory user a resource really is. One person can own the time sheets of
 * several resources (e.g. a scrum master owning bots' time sheets), so the owner's account is
 * only used when it actually is the resource:
 * 1. the owner's user id or directory name matches the resource name -> the owner's UPN;
 * 2. otherwise exactly one directory user with the resource's name -> that user's UPN;
 * 3. otherwise null (callers show initials).
 * Throws if Graph is unreachable so the caller doesn't cache a guess.
 */
export async function resolveResourceUpn(
  resource: ResourceIdentityInput,
  emailDomain: string,
  lookups: GraphLookups = { getGraphUser, findGraphUsersByDisplayName }
): Promise<string | null> {
  const name = resource.name?.trim();
  if (!name) return null;
  const wanted = normalizeName(name);
  const owner = ownerUpn(resource.ownerUserId, emailDomain);

  if (owner) {
    // The owner id is "first.last" for people who own their own time sheet
    if (normalizeName(owner.split('@')[0]) === wanted) return owner;
    const user = await lookups.getGraphUser(owner);
    if (user && normalizeName(user.displayName) === wanted) return owner;
  }

  const matches = await lookups.findGraphUsersByDisplayName(name);
  const exact = matches.filter((u) => normalizeName(u.displayName) === wanted);
  return exact.length === 1 ? exact[0].userPrincipalName : null;
}

const identityCache = new Map<string, Promise<ResourceIdentity>>();

/** Clears resolved identities (e.g. on logout). */
export function clearResourceIdentityCache(): void {
  identityCache.clear();
}

/**
 * Resolves a resource's own UPN and profile photo, cached for the session per resource
 * (concurrent callers share one lookup). Failures aren't cached so a later call can retry.
 */
export function resolveResourceIdentity(
  resource: ResourceIdentityInput,
  emailDomain: string
): Promise<ResourceIdentity> {
  // The domain only matters when the owner is a bare user id
  const domain = resource.ownerUserId?.includes('@') ? '' : emailDomain;
  const key = [resource.name, resource.ownerUserId, domain]
    .map((part) => part?.trim().toLowerCase() ?? '')
    .join('|');
  const cached = identityCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<ResourceIdentity> => {
    const upn = await resolveResourceUpn(resource, emailDomain);
    const photoUrl = upn ? await getUserProfilePhoto(upn) : null;
    return { upn, photoUrl };
  })().catch(() => {
    identityCache.delete(key);
    return { upn: null, photoUrl: null };
  });
  identityCache.set(key, promise);
  return promise;
}
