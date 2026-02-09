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
  jobTaskLines: 1002, // Job Task Lines subpage
  jobPlanningLines: 1006, // Job Planning Lines
  jobLedgerEntries: 92, // Job Ledger Entries
  timeSheetManager: 955, // Time Sheet Manager (for creating timesheets)
  timeSheets: 973, // Time Sheets list (user's own)
  extensionManagement: 2503, // Extension Management page
};

// Thyme BC Extension App ID (from app.json in thyme-bc-extension repo)
const THYME_EXTENSION_APP_ID = 'f879df78-af6d-44cb-987e-ac54c2755e71';

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
 * Generate a URL to open the Time Sheet Manager in Business Central
 * This is where managers can create timesheets for their team members.
 * @param companyName - Optional company name to include in the URL
 */
export function getBCTimeSheetManagerUrl(companyName?: string): string {
  return getBCPageUrl(BC_PAGES.timeSheetManager, companyName);
}

/**
 * Get the base Business Central URL (for linking to BC home)
 */
export function getBCHomeUrl(): string {
  return getBCBaseUrl();
}

/**
 * Generate a URL to open a specific resource card in Business Central
 * @param resourceNo - The resource number
 * @param companyName - Optional company name to include in the URL
 */
export function getBCResourceUrl(resourceNo: string, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  let url = `${baseUrl}/?`;
  if (companyName) {
    url += `company=${encodeURIComponent(companyName)}&`;
  }
  // Escape single quotes in resourceNo for BC filter syntax
  const escapedResourceNo = resourceNo.replace(/'/g, "''");
  url += `page=${BC_PAGES.resource}&filter=${encodeURIComponent(`'No.' IS '${escapedResourceNo}'`)}`;
  return url;
}

/**
 * Generate a URL to open a specific job task in Business Central
 * Opens the Job Card page filtered to the specific job, where the task can be found
 * @param jobNumber - The job/project number
 * @param taskNo - The task number (for reference, BC shows all tasks on the job card)
 * @param companyName - Optional company name to include in the URL
 */
export function getBCJobTaskUrl(jobNumber: string, taskNo: string, companyName?: string): string {
  // Job tasks are viewed on the Job Card page (page 88), so we open the job
  // The task lines are shown in a subpage on the job card
  return getBCJobUrl(jobNumber, companyName);
}

/**
 * Generate a URL to open Job Planning Lines in Business Central filtered by job number
 * @param jobNumber - The job/project number
 * @param companyName - Optional company name to include in the URL
 */
export function getBCJobPlanningLinesUrl(jobNumber: string, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  let url = `${baseUrl}/?`;
  if (companyName) {
    url += `company=${encodeURIComponent(companyName)}&`;
  }
  const escapedJobNumber = jobNumber.replace(/'/g, "''");
  url += `page=${BC_PAGES.jobPlanningLines}&filter=${encodeURIComponent(`'Job No.' IS '${escapedJobNumber}'`)}`;
  return url;
}

/**
 * Generate a URL to open Job Ledger Entries in Business Central filtered by job number
 * @param jobNumber - The job/project number
 * @param companyName - Optional company name to include in the URL
 */
export function getBCJobLedgerEntriesUrl(jobNumber: string, companyName?: string): string {
  const baseUrl = getBCBaseUrl();
  let url = `${baseUrl}/?`;
  if (companyName) {
    url += `company=${encodeURIComponent(companyName)}&`;
  }
  const escapedJobNumber = jobNumber.replace(/'/g, "''");
  url += `page=${BC_PAGES.jobLedgerEntries}&filter=${encodeURIComponent(`'Job No.' IS '${escapedJobNumber}'`)}`;
  return url;
}

/**
 * Generate a URL to open the Extension Management page in Business Central
 * filtered to the Thyme BC Extension for installation.
 * User can click "Install" on this page to install the extension.
 */
export function getBCExtensionInstallUrl(): string {
  const baseUrl = getBCBaseUrl();
  // Filter by extension ID to show only the Thyme extension
  const filter = encodeURIComponent(`'ID' IS '${THYME_EXTENSION_APP_ID}'`);
  return `${baseUrl}/?page=${BC_PAGES.extensionManagement}&filter=${filter}`;
}
