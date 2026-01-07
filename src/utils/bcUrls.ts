/**
 * Utility functions for generating Business Central URLs
 */

import { bcClient } from '@/services/bc/bcClient';

const BC_TENANT_ID = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || '';

// Business Central page IDs
const BC_PAGES = {
  jobList: 89, // Jobs (Projects) list
  customerList: 22, // Customer list
  job: 88, // Single job card
  customer: 21, // Customer card
};

/**
 * Get the base Business Central URL for the current tenant and environment
 * Uses the dynamically selected environment from the company switcher
 */
function getBCBaseUrl(): string {
  const environment = bcClient.environment || 'Production';
  return `https://businesscentral.dynamics.com/${BC_TENANT_ID}/${environment}`;
}

/**
 * Generate a URL to open a specific page in Business Central
 * @param pageId - The BC page ID
 * @param companyName - Optional company name to include in the URL
 */
export function getBCPageUrl(pageId: number, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  const params = new URLSearchParams();
  if (companyName) {
    params.set('company', companyName);
  }
  params.set('page', pageId.toString());
  return `${baseUrl}/?${params.toString()}`;
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
  const params = new URLSearchParams();
  if (companyName) {
    params.set('company', companyName);
  }
  params.set('page', BC_PAGES.job.toString());
  params.set('filter', `'No.' IS '${jobNumber}'`);
  return `${baseUrl}/?${params.toString()}`;
}

/**
 * Generate a URL to open a specific customer in Business Central
 */
export function getBCCustomerUrl(customerNumber: string): string {
  return `${getBCBaseUrl()}/?page=${BC_PAGES.customer}&filter='No.' IS '${encodeURIComponent(customerNumber)}'`;
}
