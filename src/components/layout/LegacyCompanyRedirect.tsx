'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@/services/auth';
import { bcClient } from '@/services/bc/bcClient';
import { useCompanyStore } from '@/hooks';
import { LandingPage } from '@/components/landing/LandingPage';
import { Button, Card } from '@/components/ui';
import { isValidCompanyId, legacyToCompanyUrl } from '@/utils/companyPath';
import { Layout } from './Layout';

/**
 * Page body for the pre-company URLs (`/time`, `/projects/PR00100`, …) so old links
 * and bookmarks keep working: once signed in, they redirect to the same page under
 * the remembered company, keeping the query string and hash.
 */
export function LegacyCompanyRedirect() {
  return (
    <>
      <UnauthenticatedTemplate>
        {/* Signing in from here returns to this URL, which then redirects */}
        <LandingPage />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <RedirectToCompany />
      </AuthenticatedTemplate>
    </>
  );
}

function RedirectToCompany() {
  const router = useRouter();
  const {
    companies,
    companiesLoaded,
    failedEnvironments,
    selectedCompany,
    isLoading,
    error,
    fetchCompanies,
  } = useCompanyStore();

  // Redirect to the selected company once the company list has resolved it. That's
  // the remembered company if the user still has it, otherwise an accessible default,
  // so an old link never lands on a company they've lost access to. If the remembered
  // company's environment failed to load, the store keeps it in bcClient without
  // selecting it; go there and let the company page offer a retry if needed.
  const rememberedUnknown =
    companiesLoaded &&
    !selectedCompany &&
    isValidCompanyId(bcClient.companyId) &&
    failedEnvironments.includes(bcClient.environment);
  const target = selectedCompany?.environment
    ? { id: selectedCompany.id, environment: selectedCompany.environment }
    : rememberedUnknown
      ? { id: bcClient.companyId, environment: bcClient.environment }
      : null;
  const targetId = target?.id;
  const targetEnvironment = target?.environment;

  useEffect(() => {
    if (targetId && targetEnvironment) {
      const { pathname, search, hash } = window.location;
      router.replace(
        legacyToCompanyUrl({ id: targetId, environment: targetEnvironment }, pathname, search, hash)
      );
    } else if (!companiesLoaded) {
      fetchCompanies();
    }
  }, [targetId, targetEnvironment, companiesLoaded, fetchCompanies, router]);

  if (!target && (error || (companiesLoaded && companies.length === 0))) {
    return (
      <Layout>
        <Card variant="bordered" className="mx-auto max-w-lg p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold text-white">
            {error
              ? "Couldn't load your Business Central companies"
              : 'No Business Central companies are available to your account'}
          </h1>
          {error && <p className="text-dark-300 mb-6 text-sm">{error}</p>}
          {error && (
            <Button onClick={() => fetchCompanies()} isLoading={isLoading}>
              Try again
            </Button>
          )}
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-center py-24" role="status">
        <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2" />
        <span className="text-dark-400 ml-3 text-sm">Opening company...</span>
      </div>
    </Layout>
  );
}
