import { redirect } from 'next/navigation';
import { companyPath, isValidCompanyId, parseEnvironment } from '@/utils/companyPath';

type Params = { environment: string; companyId: string };

// A bare company URL opens the company's Time page
export default async function CompanyHomePage({ params }: { params: Promise<Params> }) {
  const { environment, companyId } = await params;
  const env = parseEnvironment(environment);
  // The layout has already 404'd anything invalid; this keeps the types honest
  if (!env || !isValidCompanyId(companyId)) return null;
  redirect(companyPath({ id: companyId, environment: env }));
}
