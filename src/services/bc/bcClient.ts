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
  PaginatedResponse,
} from '@/types';

const BC_BASE_URL =
  process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0';
const BC_TENANT_ID = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || '';
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

  private get tenantPath(): string {
    return BC_TENANT_ID ? `${BC_TENANT_ID}/` : '';
  }

  private get baseUrl(): string {
    if (!this._companyId) {
      throw new Error(
        'BusinessCentralClient: companyId is not set. Select a company or configure NEXT_PUBLIC_BC_COMPANY_ID.'
      );
    }
    return `${BC_BASE_URL}/${this.tenantPath}${this._environment}/api/v2.0/companies(${this._companyId})`;
  }

  private get apiBaseUrl(): string {
    return `${BC_BASE_URL}/${this.tenantPath}${this._environment}/api/v2.0`;
  }

  private get customApiBaseUrl(): string {
    if (!this._companyId) {
      throw new Error(
        'BusinessCentralClient: companyId is not set. Select a company or configure NEXT_PUBLIC_BC_COMPANY_ID.'
      );
    }
    return `${BC_BASE_URL}/${this.tenantPath}${this._environment}/api/${THYME_API_PUBLISHER}/${THYME_API_GROUP}/${THYME_API_VERSION}/companies(${this._companyId})`;
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

    const tenantPath = BC_TENANT_ID ? `${BC_TENANT_ID}/` : '';
    const url = `${BC_BASE_URL}/${tenantPath}${environment}/api/v2.0/companies`;
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

  // Job Tasks - requires Thyme BC Extension
  async getJobTasks(jobNumber: string): Promise<BCJobTask[]> {
    // Check if extension is installed
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) return [];

      // Escape single quotes in jobNumber for OData filter syntax
      const escapedJobNumber = jobNumber.replace(/'/g, "''");
      const filter = `jobNo eq '${escapedJobNumber}'`;
      const url = `${this.customApiBaseUrl}/jobTasks?$filter=${encodeURIComponent(filter)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.value || [];
    } catch {
      return [];
    }
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
    try {
      const filter = `email eq '${email}'`;
      const resources = await this.getResources(filter);
      return resources[0] || null;
    } catch (error) {
      // BC returns 404 when no resources match the filter
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
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

  // ============================================
  // Timesheet API (requires Thyme BC Extension)
  // ============================================

  private async customApiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      throw new Error(`BC API Error (${response.status}): ${errorText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get timesheets, optionally filtered by resource number and/or date.
   * @param resourceNo - Filter by resource number (employee)
   * @param startingDate - Filter by week starting date (YYYY-MM-DD)
   */
  async getTimeSheets(resourceNo?: string, startingDate?: string): Promise<BCTimeSheet[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error(
        'Thyme BC Extension is not installed. Timesheet functionality requires the extension.'
      );
    }

    const filters: string[] = [];
    if (resourceNo) {
      const escaped = resourceNo.replace(/'/g, "''");
      filters.push(`resourceNo eq '${escaped}'`);
    }
    if (startingDate) {
      filters.push(`startingDate eq ${startingDate}`);
    }

    let endpoint = '/timeSheets';
    if (filters.length > 0) {
      endpoint += `?$filter=${encodeURIComponent(filters.join(' and '))}`;
    }

    const response = await this.customApiFetch<PaginatedResponse<BCTimeSheet>>(endpoint);
    return response.value;
  }

  /**
   * Get a specific timesheet by ID.
   */
  async getTimeSheet(timeSheetId: string): Promise<BCTimeSheet> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    return this.customApiFetch<BCTimeSheet>(`/timeSheets(${timeSheetId})`);
  }

  /**
   * Get lines for a specific timesheet.
   */
  async getTimeSheetLines(timeSheetNo: string): Promise<BCTimeSheetLine[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const escaped = timeSheetNo.replace(/'/g, "''");
    const endpoint = `/timeSheetLines?$filter=${encodeURIComponent(`timeSheetNo eq '${escaped}'`)}`;
    const response = await this.customApiFetch<PaginatedResponse<BCTimeSheetLine>>(endpoint);
    return response.value;
  }

  /**
   * Create a new timesheet line (time entry).
   */
  async createTimeSheetLine(
    line: Omit<BCTimeSheetLine, 'id' | 'lineNo' | 'totalQuantity' | 'status' | '@odata.etag'>
  ): Promise<BCTimeSheetLine> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    return this.customApiFetch<BCTimeSheetLine>('/timeSheetLines', {
      method: 'POST',
      body: JSON.stringify(line),
    });
  }

  /**
   * Update an existing timesheet line.
   */
  async updateTimeSheetLine(
    lineId: string,
    updates: Partial<BCTimeSheetLine>,
    etag: string
  ): Promise<BCTimeSheetLine> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    return this.customApiFetch<BCTimeSheetLine>(`/timeSheetLines(${lineId})`, {
      method: 'PATCH',
      headers: {
        'If-Match': etag,
      },
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a timesheet line.
   */
  async deleteTimeSheetLine(lineId: string, etag: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheetLines(${lineId})`, {
      method: 'DELETE',
      headers: {
        'If-Match': etag,
      },
    });
  }

  /**
   * Submit a timesheet for approval.
   */
  async submitTimeSheet(timeSheetId: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheets(${timeSheetId})/Microsoft.NAV.submit`, {
      method: 'POST',
    });
  }

  /**
   * Reopen a timesheet (e.g., after rejection to make edits).
   */
  async reopenTimeSheet(timeSheetId: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheets(${timeSheetId})/Microsoft.NAV.reopen`, {
      method: 'POST',
    });
  }

  /**
   * Approve a timesheet (manager action).
   */
  async approveTimeSheet(timeSheetId: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheets(${timeSheetId})/Microsoft.NAV.approve`, {
      method: 'POST',
    });
  }

  /**
   * Reject a timesheet (manager action).
   */
  async rejectTimeSheet(timeSheetId: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheets(${timeSheetId})/Microsoft.NAV.reject`, {
      method: 'POST',
    });
  }

  /**
   * Derive a display-friendly status from timesheet FlowFields.
   */
  getTimesheetDisplayStatus(
    timesheet: BCTimeSheet
  ): 'Open' | 'Partially Submitted' | 'Submitted' | 'Rejected' | 'Approved' | 'Mixed' {
    const { openExists, submittedExists, rejectedExists, approvedExists } = timesheet;

    // All approved, nothing else
    if (approvedExists && !openExists && !submittedExists && !rejectedExists) {
      return 'Approved';
    }
    // Any rejected
    if (rejectedExists) {
      return 'Rejected';
    }
    // All submitted, nothing open
    if (submittedExists && !openExists) {
      return 'Submitted';
    }
    // Some submitted, some open
    if (submittedExists && openExists) {
      return 'Partially Submitted';
    }
    // Mix of approved and other states
    if (approvedExists && (openExists || submittedExists)) {
      return 'Mixed';
    }
    // Default to Open
    return 'Open';
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
