import { useEffect, useMemo, useState } from 'react';
import { resolveResourceIdentity, useAuth } from '@/services/auth';
import {
  getLicenceToken,
  getLicensedUsers,
  getSubscribedSkus,
  isLicenceAdmin,
} from '@/services/auth/licenceService';
import {
  getLicenceCounts,
  getPeopleLicences,
  type LicenceCount,
  type LicensedUser,
  type PersonLicences,
  type SubscribedSku,
} from '@/utils/licences';
import type { BCResource } from '@/types';

export type LicenceData =
  /** Not an admin, or the directory permission isn't granted: show nothing */
  | { status: 'hidden' | 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      /** Each licensed user's licences by user principal name (lower case) */
      people: Map<string, PersonLicences>;
      counts: LicenceCount[];
    };

// One load per session, shared by every caller (the Team page's tags and dialog)
let loaded: Promise<{ skus: SubscribedSku[]; users: LicensedUser[] } | null> | null = null;

function loadLicences() {
  loaded ??= (async () => {
    const token = await getLicenceToken();
    if (!token || !(await isLicenceAdmin(token))) return null;
    const [skus, users] = await Promise.all([getSubscribedSkus(token), getLicensedUsers(token)]);
    return { skus, users };
  })();
  // A failure isn't kept, so a reload of the page can try again
  loaded.catch(() => (loaded = null));
  return loaded;
}

/**
 * The organisation's licences, for Microsoft 365 admins only (see licenceService):
 * hidden for anyone else and until an admin has granted the directory permission.
 */
export function useLicences(): LicenceData {
  const { account } = useAuth();
  const [data, setData] = useState<LicenceData>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadLicences()
      .then((result) => {
        if (cancelled) return;
        setData(
          result
            ? {
                status: 'ready',
                people: getPeopleLicences(result.skus, result.users),
                counts: getLicenceCounts(result.skus),
              }
            : { status: 'hidden' }
        );
      })
      .catch((error) => {
        console.error('Failed to load licences:', error);
        if (!cancelled) setData({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [account?.homeAccountId]);

  return data;
}

/**
 * Each resource's licences, by resource id, matched through the directory user the
 * resource is (the same lookup as its photo). Missing when the person can't be matched.
 */
export function useResourceLicences(
  resources: Pick<BCResource, 'id' | 'name' | 'displayName' | 'number' | 'timeSheetOwnerUserId'>[],
  userEmail: string,
  licences: LicenceData
): Record<string, PersonLicences | null> {
  const [byResource, setByResource] = useState<Record<string, PersonLicences | null>>({});
  const emailDomain = userEmail ? userEmail.split('@')[1] : '';
  const people = licences.status === 'ready' ? licences.people : null;
  const resourcesKey = useMemo(
    () => resources.map((r) => `${r.id}|${r.name}|${r.timeSheetOwnerUserId}`).join(','),
    [resources]
  );

  useEffect(() => {
    if (!people) return;
    let cancelled = false;
    for (const resource of resources) {
      const owner = resource.timeSheetOwnerUserId;
      resolveResourceIdentity(
        {
          name: resource.name || resource.displayName || resource.number,
          ownerUserId: owner && emailDomain ? `${owner.toLowerCase()}@${emailDomain}` : null,
        },
        emailDomain
      )
        .then(({ upn, failed }) => {
          if (cancelled || failed) return;
          // Matched to a directory user: their licences, or null for none at all
          const person = upn ? (people.get(upn.toLowerCase()) ?? null) : undefined;
          if (person === undefined) return;
          setByResource((prev) => ({ ...prev, [resource.id]: person }));
        })
        .catch(() => {
          // Not matched: no tag
        });
    }
    return () => {
      cancelled = true;
    };
    // resourcesKey stands in for `resources`, a new array on every reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourcesKey, emailDomain, people]);

  return byResource;
}
