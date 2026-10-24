import { useEffect } from 'react';
import { useBillableTargetStore } from './useBillableTargetStore';
import { useCompanyStore } from './useCompanyStore';
import { resolveCompanyDefault } from '@/utils';

/**
 * The company default billable target, or null until this company's Timmie Setup has
 * loaded (so another company's default is never used) and on extensions without
 * Timmie Setup. Pass `enabled: false` to skip loading, e.g. when the resources have no
 * billable target fields.
 */
export function useCompanyBillableDefault(enabled: boolean): number | null {
  const { companyVersion } = useCompanyStore();
  const { companyDefaultPercent, setupAvailable, loadedForCompanyVersion, loadCompanyDefault } =
    useBillableTargetStore();

  useEffect(() => {
    if (enabled) void loadCompanyDefault(companyVersion);
  }, [enabled, companyVersion, loadCompanyDefault]);

  if (!enabled || setupAvailable !== true || loadedForCompanyVersion !== companyVersion) {
    return null;
  }
  return resolveCompanyDefault(companyDefaultPercent);
}
