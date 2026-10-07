import { redirect } from 'next/navigation';
import {
  companyPath,
  isValidCompanyId,
  parseEnvironment,
  toSearchString,
  type SearchParamsRecord,
} from '@/utils/companyPath';

type Params = { environment: string; companyId: string };

// A bare company URL opens the company's Time page, keeping the query string (e.g. ?week=)
export default async function CompanyHomePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ environment, companyId }, query] = await Promise.all([params, searchParams]);
  const env = parseEnvironment(environment);
  // The layout has already 404'd anything invalid; this keeps the types honest
  if (!env || !isValidCompanyId(companyId)) return null;
  redirect(`${companyPath({ id: companyId, environment: env })}${toSearchString(query)}`);
}
