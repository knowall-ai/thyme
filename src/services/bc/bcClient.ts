import { getBCAccessToken } from '../auth';
import type {
  BCJob,
  BCProject,
  BCCustomer,
  BCEmployee,
  BCJobTask,
  BCJobJournalLine,
  BCResource,
  PaginatedResponse,
} from '@/types';

const BC_BASE_URL =
  process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0';
const BC_ENVIRONMENT = process.env.NEXT_PUBLIC_BC_ENVIRONMENT || 'sandbox';
const BC_COMPANY_ID = process.env.NEXT_PUBLIC_BC_COMPANY_ID || '';

// Custom Thyme BC Extension API settings
const THYME_API_PUBLISHER = 'knowall';
const THYME_API_GROUP = 'thyme';
const THYME_API_VERSION = 'v1.0';

class BusinessCentralClient {
  private baseUrl: string;
  private customApiBaseUrl: string;
  private _extensionInstalled: boolean | null = null;

  constructor() {
    this.baseUrl = `${BC_BASE_URL}/${BC_ENVIRONMENT}/api/v2.0/companies(${BC_COMPANY_ID})`;
    this.customApiBaseUrl = `${BC_BASE_URL}/${BC_ENVIRONMENT}/api/${THYME_API_PUBLISHER}/${THYME_API_GROUP}/${THYME_API_VERSION}/companies(${BC_COMPANY_ID})`;
  }

  /**
   * Check if the Thyme BC Extension is installed.
   * The extension provides additional API endpoints with customer and task data.
   * @see https://github.com/knowall-ai/thyme-bc-extension
   */
  async isExtensionInstalled(): Promise<boolean> {
    // Return cached result if available
    if (this._extensionInstalled !== null) {
      return this._extensionInstalled;
    }

    try {
      const token = await getBCAccessToken();
      if (!token) {
        this._extensionInstalled = false;
        return false;
      }

      // Try to access the custom API endpoint
      const url = `${this.customApiBaseUrl}/projects?$top=1`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      // If we get a 200, the extension is installed
      this._extensionInstalled = response.ok;
      return this._extensionInstalled;
    } catch {
      this._extensionInstalled = false;
      return false;
    }
  }

  /**
   * Reset the cached extension status (useful after installation)
   */
  resetExtensionCache(): void {
    this._extensionInstalled = null;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await getBCAccessToken();

    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BC API Error (${response.status}): ${errorText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Projects
  async getProjects(filter?: string): Promise<BCProject[]> {
    let endpoint = '/projects';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    const response = await this.fetch<PaginatedResponse<BCProject>>(endpoint);
    return response.value;
  }

  async getProject(projectId: string): Promise<BCProject> {
    return this.fetch<BCProject>(`/projects(${projectId})`);
  }

  // Customers
  async getCustomers(filter?: string): Promise<BCCustomer[]> {
    let endpoint = '/customers';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    const response = await this.fetch<PaginatedResponse<BCCustomer>>(endpoint);
    return response.value;
  }

  async getCustomer(customerId: string): Promise<BCCustomer> {
    return this.fetch<BCCustomer>(`/customers(${customerId})`);
  }

  // Employees
  async getEmployees(filter?: string): Promise<BCEmployee[]> {
    let endpoint = '/employees';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    const response = await this.fetch<PaginatedResponse<BCEmployee>>(endpoint);
    return response.value;
  }

  async getEmployee(employeeId: string): Promise<BCEmployee> {
    return this.fetch<BCEmployee>(`/employees(${employeeId})`);
  }

  // Jobs (Legacy - use getProjects instead)
  async getJobs(filter?: string): Promise<BCJob[]> {
    let endpoint = '/jobs';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    const response = await this.fetch<PaginatedResponse<BCJob>>(endpoint);
    return response.value;
  }

  async getJob(jobId: string): Promise<BCJob> {
    return this.fetch<BCJob>(`/jobs(${jobId})`);
  }

  // Job Tasks - BC API v2.0 doesn't expose job tasks in standard endpoints
  // This requires a custom API page to be created in BC
  async getJobTasks(_jobNumber: string): Promise<BCJobTask[]> {
    // Standard BC API v2.0 doesn't have job tasks endpoint
    // Options to enable this:
    // 1. Create a custom API page in BC that exposes Job Tasks
    // 2. Use BC's OData v4 endpoint with $expand (if supported)
    // For now, return empty array - tasks must be added via custom BC API
    console.warn('Job tasks endpoint not available in standard BC API v2.0');
    return [];
  }

  async getJobTask(jobTaskId: string): Promise<BCJobTask> {
    return this.fetch<BCJobTask>(`/jobTasks(${jobTaskId})`);
  }

  // Resources (Users/Employees)
  async getResources(filter?: string): Promise<BCResource[]> {
    let endpoint = "/resources?$filter=type eq 'Person'";
    if (filter) {
      endpoint += ` and ${filter}`;
    }
    const response = await this.fetch<PaginatedResponse<BCResource>>(endpoint);
    return response.value;
  }

  async getResource(resourceId: string): Promise<BCResource> {
    return this.fetch<BCResource>(`/resources(${resourceId})`);
  }

  async getResourceByEmail(email: string): Promise<BCResource | null> {
    const filter = `email eq '${email}'`;
    const resources = await this.getResources(filter);
    return resources[0] || null;
  }

  // Job Journal Lines (Time Entries)
  async getJobJournalLines(
    journalTemplateName: string,
    journalBatchName: string
  ): Promise<BCJobJournalLine[]> {
    const filter = `journalTemplateName eq '${journalTemplateName}' and journalBatchName eq '${journalBatchName}'`;
    const endpoint = `/jobJournalLines?$filter=${encodeURIComponent(filter)}`;
    const response = await this.fetch<PaginatedResponse<BCJobJournalLine>>(endpoint);
    return response.value;
  }

  async createJobJournalLine(
    line: Omit<BCJobJournalLine, 'id' | 'lineNumber'>
  ): Promise<BCJobJournalLine> {
    return this.fetch<BCJobJournalLine>('/jobJournalLines', {
      method: 'POST',
      body: JSON.stringify(line),
    });
  }

  async updateJobJournalLine(
    lineId: string,
    updates: Partial<BCJobJournalLine>,
    etag: string
  ): Promise<BCJobJournalLine> {
    return this.fetch<BCJobJournalLine>(`/jobJournalLines(${lineId})`, {
      method: 'PATCH',
      headers: {
        'If-Match': etag,
      },
      body: JSON.stringify(updates),
    });
  }

  async deleteJobJournalLine(lineId: string, etag: string): Promise<void> {
    await this.fetch(`/jobJournalLines(${lineId})`, {
      method: 'DELETE',
      headers: {
        'If-Match': etag,
      },
    });
  }

  // Post job journal (commit time entries)
  async postJobJournal(journalTemplateName: string, journalBatchName: string): Promise<void> {
    // This typically requires a custom API endpoint or action in BC
    // The standard API doesn't directly support posting journals
    // You would need to create a custom API page in BC for this
    await this.fetch(
      `/jobJournals(${journalTemplateName},${journalBatchName})/Microsoft.NAV.post`,
      {
        method: 'POST',
      }
    );
  }

  // Company Information
  async getCompanyInfo(): Promise<{
    displayName: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    country: string;
    email: string;
    website: string;
    currencyCode: string;
  } | null> {
    const response = await this.fetch<
      PaginatedResponse<{
        displayName: string;
        addressLine1: string;
        addressLine2: string;
        city: string;
        postalCode: string;
        country: string;
        email: string;
        website: string;
        currencyCode: string;
      }>
    >('/companyInformation');
    return response.value[0] || null;
  }
}

export const bcClient = new BusinessCentralClient();
