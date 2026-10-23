import type { Project } from '@/types';

/** What a project with no customer is grouped and filtered under */
export const NO_CUSTOMER = 'No Customer';

type ProjectCustomerFields = Pick<Project, 'customerNo' | 'customerName'>;

/**
 * The key identifying a project's customer: the BC customer number. Names are not keys
 * (one customer can come back with several names, two customers can share one), so the
 * name is only a fallback for projects without a number.
 */
export function getCustomerKey(project: ProjectCustomerFields): string {
  return project.customerNo?.trim() || project.customerName?.trim() || NO_CUSTOMER;
}

/** The customer's display name for a project (see getCustomerKey for the key) */
export function getCustomerLabel(project: ProjectCustomerFields): string {
  return project.customerName?.trim() || project.customerNo?.trim() || NO_CUSTOMER;
}

/** One entry per customer key, labelled with the first name seen for that key */
export function uniqueCustomerOptions(
  projects: ProjectCustomerFields[]
): { key: string; name: string }[] {
  const customers = new Map<string, string>();
  for (const p of projects) {
    const key = getCustomerKey(p);
    if (!customers.has(key)) customers.set(key, getCustomerLabel(p));
  }
  return [...customers].map(([key, name]) => ({ key, name }));
}

/**
 * The value of a project's customer in the time entry customer dropdown: the customer
 * number, or the lower-cased name (else 'unknown') for projects without one.
 */
export function customerOptionValue(project: ProjectCustomerFields | null | undefined): string {
  return project?.customerNo?.trim() || (project?.customerName || 'Unknown').trim().toLowerCase();
}
