'use client';

import { Fragment, ReactNode, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BuildingOffice2Icon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { bcClient } from '@/services/bc/bcClient';
import {
  confirmDiscardRunningTimer,
  switchCompany,
  useCompanyPath,
  useCompanyStore,
} from '@/hooks';
import { LandingPage } from '@/components/landing/LandingPage';
import { Button, Card } from '@/components/ui';
import type { BCEnvironmentType } from '@/types';
import {
  ENVIRONMENT_LABELS,
  companyPath,
  getCompanyRouteState,
  pathForCompanySwitch,
  stripCompanyPrefix,
} from '@/utils/companyPath';
import { Layout } from './Layout';
import { SignInExpired } from './SignInExpired';

interface CompanyRouteGateProps {
  environment: BCEnvironmentType;
  companyId: string;
  children: ReactNode;
}

/**
 * Wraps every `/{environment}/{companyId}/…` page.
 *
 * Signed out: shows the landing page in place, so signing in from here returns to
 * this exact URL (MSAL navigates back to the page the login started from).
 *
 * Signed in: makes the URL's company the active one before rendering the page, or
 * explains that the user doesn't have it.
 */
export function CompanyRouteGate({ environment, companyId, children }: CompanyRouteGateProps) {
  return (
    <>
      <UnauthenticatedTemplate>
        <LandingPage />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <CompanySync environment={environment} companyId={companyId}>
          {children}
        </CompanySync>
      </AuthenticatedTemplate>
    </>
  );
}

function CompanySync({ environment, companyId, children }: CompanyRouteGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    companies,
    companiesLoaded,
    failedEnvironments,
    selectedCompany,
    isLoading,
    error,
    reauthRequired,
    fetchCompanies,
  } = useCompanyStore();

  const urlCompany = useMemo(() => ({ id: companyId, environment }), [companyId, environment]);
  // Until the company list loads, the active company is the remembered one in bcClient
  const activeCompany = selectedCompany?.environment
    ? selectedCompany
    : { id: bcClient.companyId, environment: bcClient.environment };

  const routeState = getCompanyRouteState({
    urlCompany,
    activeCompany,
    companies,
    companiesLoaded,
    failedEnvironments,
    hasError: !!error,
  });
  const switchTarget = routeState.status === 'switch' ? routeState.company : null;

  // Zustand actions are stable; load the company list once per session
  useEffect(() => {
    if (!companiesLoaded) fetchCompanies();
  }, [companiesLoaded, fetchCompanies]);

  // The user has the URL's company but another one is active: switch, exactly as
  // the company picker does (including the running-timer check)
  useEffect(() => {
    if (!switchTarget) return;
    if (confirmDiscardRunningTimer()) {
      switchCompany(switchTarget);
      return;
    }
    // They chose to keep their timer: stay in the active company, on the same page
    const selected = useCompanyStore.getState().selectedCompany;
    const active = selected?.environment
      ? { id: selected.id, environment: selected.environment }
      : { id: bcClient.companyId, environment: bcClient.environment };
    router.replace(
      companyPath(
        active,
        pathForCompanySwitch(stripCompanyPrefix(pathname), window.location.search)
      )
    );
  }, [switchTarget, router, pathname]);

  if (routeState.status === 'ready') {
    // Keyed by company so pages remount (and refetch) rather than reuse state
    return <Fragment key={`${environment}/${companyId}`}>{children}</Fragment>;
  }

  if (routeState.status === 'no-access') {
    return <NoCompanyAccess environment={environment} companyId={companyId} />;
  }

  if (routeState.status === 'error') {
    if (reauthRequired) return <SignInExpired />;
    return (
      <Layout>
        <Card variant="bordered" className="mx-auto max-w-lg p-8">
          <div className="flex flex-col items-center text-center">
            <ExclamationTriangleIcon className="mb-4 h-12 w-12 text-yellow-500" />
            <h1 className="mb-2 text-lg font-semibold text-white">
              Couldn&apos;t load your Business Central companies
            </h1>
            <p className="text-dark-300 mb-6 text-sm">
              {error ||
                `Companies in the ${ENVIRONMENT_LABELS[environment]} environment didn't load, so Thyme can't open this one yet.`}
            </p>
            <Button onClick={() => fetchCompanies()} isLoading={isLoading}>
              Try again
            </Button>
          </div>
        </Card>
      </Layout>
    );
  }

  // Loading the company list, or switching to the URL's company
  return (
    <Layout>
      <div className="flex items-center justify-center py-24" role="status">
        <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2" />
        <span className="text-dark-400 ml-3 text-sm">Opening company...</span>
      </div>
    </Layout>
  );
}

/** Shown for a link to a company the signed-in user doesn't have in Business Central. */
function NoCompanyAccess({ environment, companyId }: Omit<CompanyRouteGateProps, 'children'>) {
  const router = useRouter();
  const pathname = usePathname();
  const companies = useCompanyStore((state) => state.companies);
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);
  // Resolves to the selected (or remembered) company, as the URL's isn't available
  const toHref = useCompanyPath();

  const goToCurrentCompany = () => {
    router.push(toHref(pathForCompanySwitch(stripCompanyPrefix(pathname), window.location.search)));
  };

  return (
    <Layout>
      <Card variant="bordered" className="mx-auto max-w-lg p-8">
        <div className="flex flex-col items-center text-center">
          <BuildingOffice2Icon className="text-dark-400 mb-4 h-12 w-12" />
          <h1 className="mb-2 text-lg font-semibold text-white">
            You don&apos;t have access to that company in Business Central
          </h1>
          <p className="text-dark-300 mb-4 text-sm">
            This link opens a company in the {ENVIRONMENT_LABELS[environment]} environment that
            isn&apos;t available to your account. If you need it, ask your Business Central
            administrator for access.
          </p>
          <p className="text-dark-500 mb-6 font-mono text-xs break-all">
            {environment}/{companyId}
          </p>
          {companies.length > 0 ? (
            <Button onClick={goToCurrentCompany}>
              Go to {selectedCompany?.displayName || 'your current company'}
            </Button>
          ) : (
            <p className="text-dark-400 text-sm">
              No Business Central companies are available to your account.
            </p>
          )}
        </div>
      </Card>
    </Layout>
  );
}
