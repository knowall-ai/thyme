import { useEffect, useState } from 'react';
import { bcClient } from '@/services/bc/bcClient';
import type { BCResource } from '@/types';
import { hasBillableTargetFields, resolveBillableTarget } from '@/utils';
import type { BillableTarget } from '@/utils';
import { useCompanyBillableDefault } from './useCompanyBillableDefault';
import { useCompanyStore } from './useCompanyStore';

/**
 * The billable target of whoever's timesheet is on screen: the teammate with
 * `resourceNo`, or the signed-in user when it's null. Their own target when set,
 * otherwise the company default - the same rule as the Team page. Null while loading
 * and on Thyme BC Extension versions without billable targets.
 */
export function useViewedBillableTarget(
  resourceNo: string | null,
  userEmail: string
): BillableTarget | null {
  const { companyVersion } = useCompanyStore();
  // Keyed by company and person, so a slow load for someone else is never shown
  const key = `${companyVersion}|${resourceNo ?? `me:${userEmail}`}`;
  const [loaded, setLoaded] = useState<{ key: string; resource: BCResource | null } | null>(null);

  useEffect(() => {
    if (!resourceNo && !userEmail) return;
    let cancelled = false;
    const load = resourceNo
      ? bcClient
          .getResources(`number eq '${resourceNo.replace(/'/g, "''")}'`)
          .then((resources) => resources[0] ?? null)
      : bcClient.getResourceForCurrentUser(userEmail);
    load
      .then((resource) => {
        if (!cancelled) setLoaded({ key, resource });
      })
      .catch(() => {
        // No target is shown; the billable % still is
        if (!cancelled) setLoaded({ key, resource: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, resourceNo, userEmail]);

  const resource = loaded?.key === key ? loaded.resource : null;
  const companyDefault = useCompanyBillableDefault(
    resource !== null && hasBillableTargetFields([resource])
  );
  if (!resource || companyDefault === null) return null;
  return resolveBillableTarget(resource, companyDefault);
}
