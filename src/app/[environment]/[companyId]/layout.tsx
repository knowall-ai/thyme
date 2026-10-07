import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { CompanyRouteGate } from '@/components/layout/CompanyRouteGate';
import { isValidCompanyId, parseEnvironment } from '@/utils/companyPath';

type Params = { environment: string; companyId: string };

/**
 * Every company-scoped page lives under `/{environment}/{companyId}/…` so links can be
 * shared. Anything that isn't a known environment plus a GUID is a 404; the gate then
 * signs the user in and switches Thyme to the company in the URL.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<Params>;
}) {
  const { environment, companyId } = await params;
  const env = parseEnvironment(environment);
  if (!env || !isValidCompanyId(companyId)) notFound();

  return (
    <CompanyRouteGate environment={env} companyId={companyId.toLowerCase()}>
      {children}
    </CompanyRouteGate>
  );
}
