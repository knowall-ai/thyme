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
 *
 * BC copies a customer's name onto the project when the project is created and doesn't
 * refresh it when the customer is renamed. When Sell-to and Bill-to are the same customer,
 * use the Bill-to name, so projects for one customer keep grouping under one name.
 */
export function getProjectCustomer(project: ProjectCustomerSource): ProjectCustomer {
  const sellToNo = project.sellToCustomerNo?.trim() ?? '';
  const billToNo = project.billToCustomerNo?.trim() ?? '';
  if (sellToNo && sellToNo !== billToNo) {
    return { number: sellToNo, name: project.sellToCustomerName?.trim() || sellToNo };
  }
  if (sellToNo) {
    const name = project.billToCustomerName?.trim() || project.sellToCustomerName?.trim();
    return { number: sellToNo, name: name || sellToNo };
  }
  return { number: billToNo, name: project.billToCustomerName?.trim() || billToNo };
}

/** The name of the customer a project's work is for (see getProjectCustomer); '' if none */
export function getProjectCustomerName(project: ProjectCustomerSource): string {
  return getProjectCustomer(project).name;
}
