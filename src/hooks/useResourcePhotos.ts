import { useEffect, useMemo, useState } from 'react';
import { resolveResourceIdentity } from '@/services/auth';
import type { BCResource } from '@/types';

/**
 * Each resource's own profile photo, by resource id, filled in as they load (never
 * blocking the page). `userEmail` is the signed-in user's, for the organisation's
 * domain: a time sheet owner like "SAM.CONTOSO" becomes "sam.contoso@<domain>".
 */
export function useResourcePhotos(
  resources: Pick<BCResource, 'id' | 'name' | 'displayName' | 'number' | 'timeSheetOwnerUserId'>[],
  userEmail: string
): Record<string, string> {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const emailDomain = userEmail ? userEmail.split('@')[1] : null;

  // Only the fields that pick a photo, so a reload of the same people doesn't refetch
  const people = useMemo(
    () =>
      resources.map((resource) => ({
        id: resource.id,
        name: resource.name || resource.displayName || resource.number,
        ownerUserId:
          resource.timeSheetOwnerUserId && emailDomain
            ? `${resource.timeSheetOwnerUserId.toLowerCase()}@${emailDomain}`
            : null,
      })),
    [resources, emailDomain]
  );
  const peopleKey = people.map((p) => `${p.id}|${p.name}|${p.ownerUserId}`).join(',');

  useEffect(() => {
    let cancelled = false;
    for (const person of people) {
      resolveResourceIdentity(
        { name: person.name, ownerUserId: person.ownerUserId },
        emailDomain ?? ''
      )
        .then(({ photoUrl }) => {
          if (!cancelled && photoUrl) {
            setPhotos((prev) =>
              prev[person.id] === photoUrl ? prev : { ...prev, [person.id]: photoUrl }
            );
          }
        })
        .catch(() => {
          // No photo: initials are shown instead
        });
    }
    return () => {
      cancelled = true;
    };
    // peopleKey stands in for `people`, which is a new array on every reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey, emailDomain]);

  return photos;
}
