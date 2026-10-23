import type { BCProject } from '@/types';

/** The customer fields of a BC project */
export type ProjectCustomerSource = Pick<
  BCProject,
  'sellToCustomerNo' | 'sellToCustomerName' | 'billToCustomerNo' | 'billToCustomerName'
>;

export interface ProjectCustomer {
  /** BC customer number; empty if the project has no customer */
  number: string;
  /** Customer name, or its number if BC has no name for it; empty if no customer */
  name: string;
}

/**
 * The customer a project's work is for: its Sell-to customer, or its Bill-to customer
 * when it has no Sell-to (projects from before BC had Sell-to on projects, or an older
 * Thyme BC Extension that doesn't return it).
 *
 * The two differ when the work comes through a partner: Sell-to is the end client and
 * Bill-to the partner who pays. Show and group projects by this customer; whether time is
 * billable still goes by the Bill-to customer (see isInternalProject).
 */
export function getProjectCustomer(project: ProjectCustomerSource): ProjectCustomer {
  const sellToNo = project.sellToCustomerNo?.trim() ?? '';
  if (sellToNo) {
    return { number: sellToNo, name: project.sellToCustomerName?.trim() || sellToNo };
  }
  const billToNo = project.billToCustomerNo?.trim() ?? '';
  return { number: billToNo, name: project.billToCustomerName?.trim() || billToNo };
}

/** The name of the customer a project's work is for (see getProjectCustomer); '' if none */
export function getProjectCustomerName(project: ProjectCustomerSource): string {
  return getProjectCustomer(project).name;
}
