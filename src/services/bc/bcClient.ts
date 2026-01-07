import { getBCAccessToken } from '../auth';
import type {
  BCCompany,
  BCEnvironmentType,
  BCJob,
  BCProject,
  BCCustomer,
  BCEmployee,
  BCJobTask,
  BCJobJournalLine,
  BCResource,
  BCTimeSheet,
  BCTimeSheetLine,
  TimeSheetStatus,
  PaginatedResponse,
} from '@/types';

const BC_BASE_URL =
  process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0';
const BC_DEFAULT_ENVIRONMENT =
  (process.env.NEXT_PUBLIC_BC_ENVIRONMENT as BCEnvironmentType) || 'production';
const BC_DEFAULT_COMPANY_ID = process.env.NEXT_PUBLIC_BC_COMPANY_ID || '';

// localStorage keys for persisting selection
const COMPANY_STORAGE_KEY = 'thyme_selected_company_id';
const ENVIRONMENT_STORAGE_KEY = 'thyme_selected_environment';

// Custom Thyme BC Extension API settings
const THYME_API_PUBLISHER = 'knowall';
const THYME_API_GROUP = 'thyme';
const THYME_API_VERSION = 'v1.0';

// Available environments to query
const BC_ENVIRONMENTS: BCEnvironmentType[] = ['sandbox', 'production'];

class BusinessCentralClient {
  private _companyId: string;
  private _environment: BCEnvironmentType;
  private _extensionInstalled: boolean | null = null;

  constructor() {
    // Try to load from localStorage, fall back to env vars
    const stored = this.loadStoredSelection();
    this._companyId = stored.companyId;
    this._environment = stored.environment;
  }

  private loadStoredSelection(): { companyId: string; environment: BCEnvironmentType } {
    if (typeof window !== 'undefined') {
      const storedCompany = localStorage.getItem(COMPANY_STORAGE_KEY);
      const storedEnv = localStorage.getItem(ENVIRONMENT_STORAGE_KEY) as BCEnvironmentType | null;
      if (storedCompany && storedEnv) {
        return { companyId: storedCompany, environment: storedEnv };
      }
    }
    return { companyId: BC_DEFAULT_COMPANY_ID, environment: BC_DEFAULT_ENVIRONMENT };
  }

  private get baseUrl(): string {
    if (!this._companyId) {
      throw new Error(
        'BusinessCentralClient: companyId is not set. Select a company or configure NEXT_PUBLIC_BC_COMPANY_ID.'
      );
    }
    return `${BC_BASE_URL}/${this._environment}/api/v2.0/companies(${this._companyId})`;
  }

  private get apiBaseUrl(): string {
    return `${BC_BASE_URL}/${this._environment}/api/v2.0`;
  }

  private get customApiBaseUrl(): string {
    if (!this._companyId) {
      throw new Error(
        'BusinessCentralClient: companyId is not set. Select a company or configure NEXT_PUBLIC_BC_COMPANY_ID.'
      );
    }
    return `${BC_BASE_URL}/${this._environment}/api/${THYME_API_PUBLISHER}/${THYME_API_GROUP}/${THYME_API_VERSION}/companies(${this._companyId})`;
  }

  // Company management
  get companyId(): string {
    return this._companyId;
  }

  get environment(): BCEnvironmentType {
    return this._environment;
  }

  setCompany(companyId: string, environment: BCEnvironmentType): void {
    const companyChanged = this._companyId !== companyId;
    const envChanged = this._environment !== environment;

    if (companyChanged || envChanged) {
      this._companyId = companyId;
      this._environment = environment;
      if (typeof window !== 'undefined') {
        localStorage.setItem(COMPANY_STORAGE_KEY, companyId);
        localStorage.setItem(ENVIRONMENT_STORAGE_KEY, environment);
      }
      // Reset extension cache when company/environment changes
      this._extensionInstalled = null;
    }
  }

  // Backwards compatibility
  setCompanyId(companyId: string): void {
    this.setCompany(companyId, this._environment);
  }

  // Fetch companies from a specific environment
  private async getCompaniesFromEnvironment(environment: BCEnvironmentType): Promise<BCCompany[]> {
    const token = await getBCAccessToken();
    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${BC_BASE_URL}/${environment}/api/v2.0/companies`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // Don't throw for 404 - environment might not exist
      if (response.status === 404) {
        return [];
      }
      const errorText = await response.text();
      throw new Error(`BC API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    // Tag each company with its environment
    // Use name as fallback if displayName is empty (some environments don't set displayName)
    return (data.value as BCCompany[]).map((company) => ({
      ...company,
      displayName: company.displayName || company.name,
      environment,
    }));
  }

  // Fetch companies from all environments
  async getAllCompanies(): Promise<BCCompany[]> {
    const results = await Promise.allSettled(
      BC_ENVIRONMENTS.map((env) => this.getCompaniesFromEnvironment(env))
    );

    const companies: BCCompany[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        companies.push(...result.value);
      }
    }
    return companies;
  }

  // Fetch companies from current environment only (backwards compatibility)
  async getCompanies(): Promise<BCCompany[]> {
    return this.getCompaniesFromEnvironment(this._environment);
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

  /**
   * Fetch from custom Thyme BC Extension API
   */
  private async fetchCustomApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await getBCAccessToken();

    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${this.customApiBaseUrl}${endpoint}`;
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
      throw new Error(`BC Custom API Error (${response.status}): ${errorText}`);
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

  // Time Sheets (requires Thyme BC Extension)

  /**
   * Get time sheets with optional filtering.
   * Requires thyme-bc-extension with Time Sheet API endpoints.
   * @see https://github.com/knowall-ai/thyme-bc-extension
   */
  async getTimeSheets(filter?: string): Promise<BCTimeSheet[]> {
    let endpoint = '/timeSheets';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    const response = await this.fetchCustomApi<PaginatedResponse<BCTimeSheet>>(endpoint);
    return response.value;
  }

  /**
   * Get time sheets pending approval for the current user.
   * The API filters by the current user's approver resource.
   */
  async getPendingApprovals(): Promise<BCTimeSheet[]> {
    const filter = "status eq 'Submitted'";
    return this.getTimeSheets(filter);
  }

  /**
   * Get a specific time sheet by ID.
   */
  async getTimeSheet(timeSheetId: string): Promise<BCTimeSheet> {
    return this.fetchCustomApi<BCTimeSheet>(`/timeSheets(${timeSheetId})`);
  }

  /**
   * Get time sheet lines for a specific time sheet.
   */
  async getTimeSheetLines(timeSheetNumber: string): Promise<BCTimeSheetLine[]> {
    const filter = `timeSheetNumber eq '${timeSheetNumber}'`;
    const endpoint = `/timeSheetLines?$filter=${encodeURIComponent(filter)}`;
    const response = await this.fetchCustomApi<PaginatedResponse<BCTimeSheetLine>>(endpoint);
    return response.value;
  }

  /**
   * Approve a time sheet.
   * This triggers the BC approval workflow.
   */
  async approveTimeSheet(timeSheetId: string, comment?: string): Promise<void> {
    await this.fetchCustomApi(`/timeSheets(${timeSheetId})/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment: comment || '' }),
    });
  }

  /**
   * Reject a time sheet.
   * This triggers the BC rejection workflow and sends notification to the submitter.
   */
  async rejectTimeSheet(timeSheetId: string, comment: string): Promise<void> {
    await this.fetchCustomApi(`/timeSheets(${timeSheetId})/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  /**
   * Approve specific time sheet lines.
   */
  async approveTimeSheetLines(lineIds: string[], comment?: string): Promise<void> {
    await this.fetchCustomApi('/timeSheetLines/approveMultiple', {
      method: 'POST',
      body: JSON.stringify({ lineIds, comment: comment || '' }),
    });
  }

  /**
   * Reject specific time sheet lines.
   */
  async rejectTimeSheetLines(lineIds: string[], comment: string): Promise<void> {
    await this.fetchCustomApi('/timeSheetLines/rejectMultiple', {
      method: 'POST',
      body: JSON.stringify({ lineIds, comment }),
    });
  }

  /**
   * Check if the current user has approval permissions.
   * Returns the resource number if the user is an approver.
   */
  async checkApprovalPermission(): Promise<{ isApprover: boolean; resourceNumber?: string }> {
    try {
      const response = await this.fetchCustomApi<{ isApprover: boolean; resourceNumber?: string }>(
        '/approvalPermissions'
      );
      return response;
    } catch {
      // If endpoint doesn't exist or fails, assume no approval permission
      return { isApprover: false };
    }
  }

  /**
   * Get approval statistics for the dashboard KPI.
   */
  async getApprovalStats(): Promise<{
    pendingCount: number;
    pendingHours: number;
  }> {
    try {
      const pendingSheets = await this.getPendingApprovals();
      const pendingCount = pendingSheets.length;
      const pendingHours = pendingSheets.reduce((sum, sheet) => sum + sheet.totalQuantity, 0);
      return { pendingCount, pendingHours };
    } catch {
      return { pendingCount: 0, pendingHours: 0 };
    }
  }

  /**
   * Get time sheets filtered by status.
   */
  async getTimeSheetsByStatus(status: TimeSheetStatus): Promise<BCTimeSheet[]> {
    const filter = `status eq '${status}'`;
    return this.getTimeSheets(filter);
  }

  /**
   * Get time sheets for a specific resource (employee).
   */
  async getTimeSheetsByResource(resourceNumber: string): Promise<BCTimeSheet[]> {
    const filter = `resourceNumber eq '${resourceNumber}'`;
    return this.getTimeSheets(filter);
  }

  /**
   * Get time sheets within a date range.
   */
  async getTimeSheetsInRange(startDate: string, endDate: string): Promise<BCTimeSheet[]> {
    const filter = `startingDate ge ${startDate} and endingDate le ${endDate}`;
    return this.getTimeSheets(filter);
  }
}

export const bcClient = new BusinessCentralClient();
