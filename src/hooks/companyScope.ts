import { bcClient } from '@/services/bc/bcClient';

/**
 * Identifies the active company (environment + id). Capture it before an async load
 * and compare again before committing the result: if the company switched meanwhile,
 * the result belongs to the old company and must be dropped.
 */
export function activeCompanyKey(): string {
  return `${bcClient.environment}/${(bcClient.companyId || '').toLowerCase()}`;
}
