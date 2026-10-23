import type { Project } from '@/types';

/** What a project with no customer is labelled */
export const NO_CUSTOMER = 'No Customer';

type ProjectCustomerFields = Pick<Project, 'customerNo' | 'customerName'>;

/**
 * The key identifying a project's customer: its BC customer number. Names are not keys
 * (one customer can come back with several names, two customers can share one), so the
 * name is only a fallback for projects without a number. Prefixed, so a name can never
 * collide with a number.
 */
export function getCustomerKey(project: ProjectCustomerFields | null | undefined): string {
  const number = project?.customerNo?.trim();
  if (number) return `no:${number}`;
  const name = project?.customerName?.trim().toLowerCase();
  return name ? `name:${name}` : 'none';
}

/** The customer's display name for a project (see getCustomerKey for the key) */
export function getCustomerLabel(project: ProjectCustomerFields): string {
  return project.customerName?.trim() || project.customerNo?.trim() || NO_CUSTOMER;
}

/**
 * One entry per customer key, labelled with the first name seen for that key, sorted by
 * label. When different customers share a name, their labels add the customer number so
 * people can tell them apart.
 */
export function uniqueCustomerOptions(
  projects: ProjectCustomerFields[]
): { key: string; name: string }[] {
  const customers = new Map<string, { name: string; number?: string }>();
  for (const p of projects) {
    const key = getCustomerKey(p);
    if (!customers.has(key)) {
      customers.set(key, { name: getCustomerLabel(p), number: p.customerNo?.trim() });
    }
  }
  const nameCounts = new Map<string, number>();
  for (const { name } of customers.values()) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return [...customers]
    .map(([key, { name, number }]) => ({
      key,
      name:
        (nameCounts.get(name) ?? 0) > 1 && number && number !== name ? `${name} (${number})` : name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
