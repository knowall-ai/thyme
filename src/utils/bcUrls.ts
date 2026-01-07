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
 */
export function getBCPageUrl(pageId: number): string {
  return `${getBCBaseUrl()}/?page=${pageId}`;
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
 */
export function getBCJobUrl(jobNumber: string): string {
  // Using the filter parameter to open a specific job
  return `${getBCBaseUrl()}/?page=${BC_PAGES.job}&filter='No.' IS '${encodeURIComponent(jobNumber)}'`;
}

/**
 * Generate a URL to open a specific customer in Business Central
 */
export function getBCCustomerUrl(customerNumber: string): string {
  return `${getBCBaseUrl()}/?page=${BC_PAGES.customer}&filter='No.' IS '${encodeURIComponent(customerNumber)}'`;
}
