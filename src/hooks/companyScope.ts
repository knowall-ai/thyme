import type { StoreApi } from 'zustand';
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

/**
 * Wrap a store's `set` so it only applies while the company is the one the async action
 * started in. A load, save, copy or approval that finishes after a company switch
 * belongs to the old company, so it must not touch the new company's state (callers
 * still get the action's own return value).
 */
export function setIfSameCompany<T>(set: StoreApi<T>['setState']): StoreApi<T>['setState'] {
  const companyKey = activeCompanyKey();
  return ((...args: Parameters<StoreApi<T>['setState']>) => {
    if (activeCompanyKey() === companyKey) set(...args);
  }) as StoreApi<T>['setState'];
}
