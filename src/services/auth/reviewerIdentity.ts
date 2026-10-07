'use client';

import { useEffect, useState } from 'react';
import { findGraphUsersByDisplayNamePrefix, getUserProfilePhoto } from './graphService';
import { normalizeName } from './resourceIdentity';

interface ReviewerLookups {
  findGraphUsersByDisplayNamePrefix: typeof findGraphUsersByDisplayNamePrefix;
}

/**
 * Works out which directory user an AI reviewer is from the name on its reviews (e.g. "Poppie").
 * Agents usually have an Entra account named after them, sometimes with a surname
 * ("Poppie Contoso"), so:
 * 1. exactly one user whose display name is the reviewer name -> that user;
 * 2. otherwise exactly one user whose display name starts with the reviewer name as a whole
 *    word ("Poppie ..." but not "Poppies") -> that user;
 * 3. otherwise null (ambiguous or unknown - callers show the initial).
 * Throws if Graph is unreachable so the caller doesn't cache a guess.
 */
export async function resolveReviewerUpn(
  reviewer: string,
  lookups: ReviewerLookups = { findGraphUsersByDisplayNamePrefix }
): Promise<string | null> {
  const name = reviewer.trim();
  if (!name) return null;
  const wanted = normalizeName(name);
  if (!wanted) return null;

  const candidates = await lookups.findGraphUsersByDisplayNamePrefix(name);
  const exact = candidates.filter((u) => normalizeName(u.displayName) === wanted);
  if (exact.length > 0) return exact.length === 1 ? exact[0].userPrincipalName : null;

  const lowerName = name.toLowerCase();
  const wordPrefix = candidates.filter((u) => {
    const display = u.displayName.trim().toLowerCase();
    return display.startsWith(lowerName) && /^[\s,.(-]/.test(display.slice(lowerName.length));
  });
  return wordPrefix.length === 1 ? wordPrefix[0].userPrincipalName : null;
}

const reviewerPhotoCache = new Map<string, Promise<string | null>>();

/** Clears resolved reviewer photos (e.g. on logout). */
export function clearReviewerPhotoCache(): void {
  reviewerPhotoCache.clear();
}

/**
 * Resolves an AI reviewer's profile photo (a data URL) or null, cached for the session per
 * reviewer name (concurrent callers share one lookup). Failures resolve to null but aren't
 * cached so a later call can retry.
 */
export function resolveReviewerPhoto(reviewer: string): Promise<string | null> {
  const key = reviewer.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  const cached = reviewerPhotoCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const upn = await resolveReviewerUpn(reviewer);
    return upn ? await getUserProfilePhoto(upn, { throwOnError: true }) : null;
  })().catch(() => {
    reviewerPhotoCache.delete(key);
    return null;
  });
  reviewerPhotoCache.set(key, promise);
  return promise;
}

/** The AI reviewer's profile photo, or null while loading / when there isn't one. */
export function useReviewerPhoto(reviewer: string | null | undefined): string | null {
  const [photo, setPhoto] = useState<{ reviewer: string; url: string | null } | null>(null);
  const name = reviewer?.trim() ?? '';

  useEffect(() => {
    if (!name) return;
    let active = true;
    resolveReviewerPhoto(name).then((url) => {
      if (active) setPhoto({ reviewer: name, url });
    });
    return () => {
      active = false;
    };
  }, [name]);

  return name && photo?.reviewer === name ? photo.url : null;
}
