'use client';

import { useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { bcClient } from '@/services/bc/bcClient';
import {
  companyHref,
  isValidCompanyId,
  parseEnvironment,
  resolveLinkCompany,
  type CompanyRef,
} from '@/utils/companyPath';
import { useCompanyStore } from './useCompanyStore';

/** The company named in the current URL (`/{environment}/{companyId}/…`), if any. */
export function useUrlCompany(): CompanyRef | null {
  const params = useParams<{ environment?: string; companyId?: string }>();
  const environment = parseEnvironment(params?.environment);
  const companyId = params?.companyId;
  return useMemo(
    () =>
      environment && isValidCompanyId(companyId)
        ? { id: companyId.toLowerCase(), environment }
        : null,
    [environment, companyId]
  );
}

/**
 * Returns `toHref(path)`, which prefixes an app path with the company it should open
 * in: `toHref('/projects')` -> `/production/{companyId}/projects`.
 *
 * Use it for every internal link and `router.push` so URLs stay shareable.
 */
export function useCompanyPath() {
  const urlCompany = useUrlCompany();
  const companies = useCompanyStore((state) => state.companies);
  const companiesLoaded = useCompanyStore((state) => state.companiesLoaded);
  const failedEnvironments = useCompanyStore((state) => state.failedEnvironments);
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);

  const company = resolveLinkCompany({
    urlCompany,
    companies,
    companiesLoaded,
    failedEnvironments,
    selectedCompany,
    storedCompany: { id: bcClient.companyId, environment: bcClient.environment },
  });
  const companyId = company?.id;
  const environment = company?.environment;

  return useCallback(
    (path: string) =>
      companyHref(path, companyId && environment ? { id: companyId, environment } : null),
    [companyId, environment]
  );
}
