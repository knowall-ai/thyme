import { bcClient } from '@/services/bc/bcClient';

// Bumped on every company switch. Part of the key, so switching A -> B -> A doesn't make a
// load started during the first visit to A look current again on the second.
let companyGeneration = 0;

/** Call when the active company changes (useCompanyStore.selectCompany does). */
export function bumpCompanyGeneration(): void {
  companyGeneration += 1;
}

/**
 * Identifies the active company (environment + id) and how many switches have happened.
 * Capture it before an async load and compare again before committing the result: if the
 * company switched meanwhile - even back to the same one - the result is stale and must
 * be dropped.
 */
export function activeCompanyKey(): string {
  return `${bcClient.environment}/${(bcClient.companyId || '').toLowerCase()}#${companyGeneration}`;
}
