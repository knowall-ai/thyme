/**
 * Utility functions for generating Business Central URLs
 */

import { bcClient } from '@/services/bc/bcClient';

const BC_TENANT_ID = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || '';

// Business Central page IDs
const BC_PAGES = {
  jobList: 89, // Jobs (Projects) list
  customerList: 22, // Customer list
  resourceList: 77, // Resource list
  job: 88, // Single job card
  customer: 21, // Customer card
  resource: 76, // Resource card
};

/**
 * Get the base Business Central URL for the current tenant and environment
 * Uses the dynamically selected environment from the company switcher
 */
function getBCBaseUrl(): string {
  const environment = bcClient.environment || 'production';
  return `https://businesscentral.dynamics.com/${BC_TENANT_ID}/${environment}`;
}

/**
 * Generate a URL to open a specific page in Business Central
 * @param pageId - The BC page ID
 * @param companyName - Optional company name to include in the URL
 */
export function getBCPageUrl(pageId: number, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  // Build URL manually to use %20 for spaces (BC doesn't accept + encoding)
  let url = `${baseUrl}/?`;
  if (companyName) {
    url += `company=${encodeURIComponent(companyName)}&`;
  }
  url += `page=${pageId}`;
  return url;
}

/**
 * Generate a URL to open the Jobs/Projects list in Business Central
 */
export function getBCJobsListUrl(): string {
  return getBCPageUrl(BC_PAGES.jobList);
}

/**
 * Generate a URL to open the Customers list in Business Central
 */
export function getBCCustomersListUrl(): string {
  return getBCPageUrl(BC_PAGES.customerList);
}

/**
 * Generate a URL to open a specific job in Business Central
 * @param jobNumber - The job/project number
 * @param companyName - Optional company name to include in the URL
 */
export function getBCJobUrl(jobNumber: string, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  // Build URL manually to use %20 for spaces (BC doesn't accept + encoding)
  let url = `${baseUrl}/?`;
  if (companyName) {
    url += `company=${encodeURIComponent(companyName)}&`;
  }
  // Escape single quotes in jobNumber for BC filter syntax
  const escapedJobNumber = jobNumber.replace(/'/g, "''");
  url += `page=${BC_PAGES.job}&filter=${encodeURIComponent(`'No.' IS '${escapedJobNumber}'`)}`;
  return url;
}

/**
 * Generate a URL to open a specific customer in Business Central
 */
export function getBCCustomerUrl(customerNumber: string): string {
  return `${getBCBaseUrl()}/?page=${BC_PAGES.customer}&filter='No.' IS '${encodeURIComponent(customerNumber)}'`;
}

/**
 * Generate a URL to open the Resources list in Business Central
 * @param companyName - Optional company name to include in the URL
 */
export function getBCResourcesListUrl(companyName?: string): string {
  return getBCPageUrl(BC_PAGES.resourceList, companyName);
}

/**
 * Get the base Business Central URL (for linking to BC home)
 */
export function getBCHomeUrl(): string {
  return getBCBaseUrl();
}
