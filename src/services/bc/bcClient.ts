import { getBCAccessToken } from '../auth';
import { ExtensionNotInstalledError } from './timeEntryService';
import type {
  BCCompany,
  BCEnvironmentType,
  BCJob,
  BCProject,
  BCCustomer,
  BCEmployee,
  BCJobTask,
  BCJobPlanningLine,
  BCJobJournalLine,
  BCResource,
  BCResourceUnitOfMeasure,
  BCThymeSetup,
  BCTimeSheet,
  BCTimeSheetLine,
  BCTimeSheetDetail,
  BCTimeEntry,
  BCTimeSuggestion,
  BCTimeSuggestionUpdate,
  BCTimesheetReview,
  BCTimesheetReviewLine,
  TimeSheetStatus,
  TimesheetDisplayStatus,
  PaginatedResponse,
} from '@/types';
import { getTimesheetDisplayStatus, decodeBCEnum, isCompanyName } from '@/utils';

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

// Valid TimeSheetStatus values for whitelist validation
const VALID_TIMESHEET_STATUSES = ['Open', 'Submitted', 'Rejected', 'Approved', 'Posted'] as const;

// Known planning-line enum values, used to narrow decoded BC strings back to
// the typed unions. An unrecognized decode falls back to the original value
// rather than being blindly cast, so unexpected BC enums aren't masked.
const PLANNING_LINE_TYPES = ['Resource', 'Item', 'G/L Account'] as const;
const PLANNING_LINE_LINE_TYPES = ['Budget', 'Billable', 'Both Budget and Billable'] as const;

// Narrow a decoded enum string to one of the allowed values, falling back to
// the original (still-typed) value when the decode isn't a recognized member.
function narrowEnum<T extends string>(decoded: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(decoded) ? (decoded as T) : fallback;
}

// A 404 on a collection GET means the entity set itself doesn't exist (an empty
// filter result is a 200 with no rows), i.e. the extension is missing or too old
function isEndpointMissing(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('BC API Error (404)');
}

// Available environments to query
const BC_ENVIRONMENTS: BCEnvironmentType[] = ['sandbox', 'production'];

/**
 * Normalize a BCProject coming off the OData wire.
 *
 * BC's OData JSON serializer encodes the leading-space enum value (`' '`,
 * the "not blocked" sentinel) as the literal string `"_x0020_"`
 * (XML schema escape for U+0020). Translate it back to a real space so
 * downstream code can use the documented enum values.
 */
function normalizeBCProject(project: BCProject): BCProject {
  if (project.blocked === ('_x0020_' as unknown as BCProject['blocked'])) {
    return { ...project, blocked: ' ' };
  }
  return project;
}

/** Flag a project whose bill-to customer is the company itself (see isInternalProject) */
function withBillToIsCompany(project: BCProject, companyNames: string[]): BCProject {
  return isCompanyName(project.billToCustomerName, companyNames)
    ? { ...project, billToIsCompany: true }
    : project;
}

/**
 * The ETag to send as If-Match, so a PATCH never overwrites someone else's newer
 * change. Throws rather than falling back to '*' when BC didn't return one.
 */
function requireETag(etag: string | undefined, recordName: string): string {
  if (!etag) {
    throw new Error(
      `BC API: no ETag returned for the ${recordName}, so it can't be updated safely`
    );
  }
  return etag;
}

// A BC SystemId (GUID), so an id can't change which URL a request goes to
const SYSTEM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSystemId(id: string, recordName: string): string {
  if (!SYSTEM_ID.test(id)) {
    throw new Error(`BC API: invalid ${recordName} id`);
  }
  return id;
}

/** A billable target must be a finite percentage from 0 to 100 */
function requireTargetPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('BC API: a billable target must be from 0 to 100');
  }
  return percent;
}

// How long the optional company-name lookups may hold up loading projects
const COMPANY_NAMES_TIMEOUT_MS = 10_000;

class BusinessCentralClient {
  private _companyId: string;
  private _environment: BCEnvironmentType;
  private _extensionInstalled: boolean | null = null;
  private _extensionCheckPromise: Promise<boolean> | null = null;
  // The current company's names, fetched once per company (see getCompanyNames)
  private _companyNames: { key: string; promise: Promise<string[]> } | null = null;

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

  get tenantId(): string {
    if (!BC_TENANT_ID) {
      throw new Error(
        'BusinessCentralClient: tenantId is not set. Configure NEXT_PUBLIC_AZURE_TENANT_ID.'
      );
    }
    return BC_TENANT_ID;
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
      this._extensionCheckPromise = null;
      this._companyNames = null;
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
      // Don't throw for 404 - environment might not exist - or for 403, where the user
      // has no access to the environment: either way it has no companies for them.
      // 401 (expired or invalid token) is a load failure, so it throws and can be retried
      if (response.status === 404 || response.status === 403) {
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

  // Fetch companies from all environments. An environment whose request failed (network
  // or server error) is listed in failedEnvironments, so callers can tell "not in the
  // list" apart from "couldn't load that part of the list"
  async getAllCompanies(): Promise<{
    companies: BCCompany[];
    failedEnvironments: BCEnvironmentType[];
  }> {
    const results = await Promise.allSettled(
      BC_ENVIRONMENTS.map((env) => this.getCompaniesFromEnvironment(env))
    );

    const companies: BCCompany[] = [];
    const failedEnvironments: BCEnvironmentType[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        companies.push(...result.value);
      } else {
        failedEnvironments.push(BC_ENVIRONMENTS[index]);
      }
    });
    return { companies, failedEnvironments };
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

    // If a check is already in progress, return that promise to deduplicate requests
    if (this._extensionCheckPromise !== null) {
      return this._extensionCheckPromise;
    }

    // Create the check promise and store it for deduplication
    this._extensionCheckPromise = this._doExtensionCheck();

    try {
      const result = await this._extensionCheckPromise;
      return result;
    } finally {
      // Clear the pending promise after completion
      this._extensionCheckPromise = null;
    }
  }

  /**
   * Internal method to perform the actual extension check.
   */
  private async _doExtensionCheck(): Promise<boolean> {
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
    this._extensionCheckPromise = null;
  }

  // ============================================
  // OData Input Sanitization Helpers
  // ============================================

  /**
   * Sanitize a string value for use in OData filters.
   * Escapes single quotes to prevent injection attacks.
   */
  private sanitizeODataString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Validate and sanitize a date string for OData filters.
   * Only allows ISO date format (YYYY-MM-DD).
   * @throws Error if the date format is invalid
   */
  private sanitizeDateInput(date: string): string {
    const trimmed = date.trim();
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(trimmed)) {
      throw new Error('Invalid date format for OData filter. Expected YYYY-MM-DD.');
    }
    return trimmed;
  }

  /**
   * Validate a TimeSheetStatus value against allowed values.
   * @throws Error if the status is not valid
   */
  private validateTimeSheetStatus(status: string): TimeSheetStatus {
    if (!VALID_TIMESHEET_STATUSES.includes(status as TimeSheetStatus)) {
      throw new Error(
        `Invalid timesheet status: ${status}. Expected one of: ${VALID_TIMESHEET_STATUSES.join(', ')}`
      );
    }
    return status as TimeSheetStatus;
  }

  /**
   * @param baseUrl - The company's API URL; pass one captured earlier to keep related
   * requests on the same company even if the selection changes in between
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl: string = this.baseUrl
  ): Promise<T> {
    const token = await getBCAccessToken();

    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${baseUrl}${endpoint}`;
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
  /** @param baseUrl - The company's custom API URL, captured earlier (see fetch) */
  private async fetchCustomApi<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl: string = this.customApiBaseUrl
  ): Promise<T> {
    const token = await getBCAccessToken();

    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${baseUrl}${endpoint}`;
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

  // Projects - uses Thyme BC Extension API for additional fields (billToCustomerName, dates, etc.)
  async getProjects(filter?: string): Promise<BCProject[]> {
    let endpoint = '/projects';
    if (filter) {
      endpoint += `?$filter=${encodeURIComponent(filter)}`;
    }
    // One company for the projects and the names they're compared with
    const customBase = this.customApiBaseUrl;
    const [response, companyNames] = await Promise.all([
      this.fetchCustomApi<PaginatedResponse<BCProject>>(endpoint, {}, customBase),
      this.getCompanyNames(),
    ]);
    return response.value.map((project) =>
      withBillToIsCompany(normalizeBCProject(project), companyNames)
    );
  }

  async getProject(projectId: string): Promise<BCProject> {
    // One company for the project and the names it's compared with
    const customBase = this.customApiBaseUrl;
    const [project, companyNames] = await Promise.all([
      this.fetchCustomApi<BCProject>(`/projects(${projectId})`, {}, customBase),
      this.getCompanyNames(),
    ]);
    return withBillToIsCompany(normalizeBCProject(project), companyNames);
  }

  /**
   * The current company's names - its display name and name from /companies, and the
   * name on its Company Information - so a project billed to the company itself
   * counts as internal. Fetched once per company, for the company selected when it's
   * called (callers read the company's projects from that same selection). The
   * lookups are optional: each has a deadline, and a failed, timed-out or empty
   * lookup leaves its names out, so projects still load, and isn't cached, so the
   * next project load tries again.
   */
  getCompanyNames(): Promise<string[]> {
    const key = `${this._environment}|${this._companyId}`;
    if (this._companyNames?.key === key) return this._companyNames.promise;

    const base = this.baseUrl;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), COMPANY_NAMES_TIMEOUT_MS);
    const options = { signal: controller.signal };
    const promise = Promise.allSettled([
      this.fetch<{ name?: string; displayName?: string }>('', options, base),
      this.fetch<PaginatedResponse<{ displayName?: string }>>('/companyInformation', options, base),
    ]).then(([company, info]) => {
      clearTimeout(deadline);
      const names = [
        company.status === 'fulfilled' ? company.value.displayName : undefined,
        company.status === 'fulfilled' ? company.value.name : undefined,
        info.status === 'fulfilled' ? info.value.value?.[0]?.displayName : undefined,
      ].filter((name): name is string => !!name?.trim());
      // Partly or wholly unavailable: use what loaded, but look again next time
      const incomplete =
        company.status === 'rejected' || info.status === 'rejected' || names.length === 0;
      if (incomplete && this._companyNames?.promise === promise) this._companyNames = null;
      return [...new Set(names)];
    });
    this._companyNames = { key, promise };
    return promise;
  }

  /**
   * Rename a project (BC Job Description, Text[100]).
   * Reads the project first for a fresh ETag, as BC requires If-Match for PATCH.
   */
  async updateProjectName(projectId: string, name: string): Promise<BCProject> {
    const current = await this.fetchCustomApi<BCProject>(`/projects(${projectId})`);
    const project = await this.fetchCustomApi<BCProject>(`/projects(${projectId})`, {
      method: 'PATCH',
      headers: {
        'If-Match': current['@odata.etag'] || '*',
      },
      body: JSON.stringify({ displayName: name }),
    });
    return normalizeBCProject(project);
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

  // Decode BC's OData enum encoding on planning-line fields so downstream code
  // can compare against the plain values. BC serializes named enums like
  // `type` "G/L Account" as "G_x002F_L_x0020_Account" and `lineType`
  // "Both Budget and Billable" as "Both_x0020_Budget_x0020_and_x0020_Billable".
  private normalizePlanningLines(lines: BCJobPlanningLine[]): BCJobPlanningLine[] {
    return lines.map((line) => ({
      ...line,
      type: narrowEnum(decodeBCEnum(line.type), PLANNING_LINE_TYPES, line.type),
      lineType: narrowEnum(decodeBCEnum(line.lineType), PLANNING_LINE_LINE_TYPES, line.lineType),
    }));
  }

  // Job Planning Lines - requires Thyme BC Extension v1.6.0+
  // Provides budget/planned hours data for projects
  async getJobPlanningLines(jobNumber: string): Promise<BCJobPlanningLine[]> {
    // Check if extension is installed
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) return [];

      // Escape single quotes in jobNumber for OData filter syntax
      const escapedJobNumber = this.sanitizeODataString(jobNumber);
      const filter = `jobNo eq '${escapedJobNumber}'`;
      const url = `${this.customApiBaseUrl}/jobPlanningLines?$filter=${encodeURIComponent(filter)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        // 404 means the endpoint doesn't exist (extension too old)
        if (response.status === 404) {
          console.warn(
            '[BC API] jobPlanningLines endpoint not found. Upgrade Thyme BC Extension to v1.6.0+.'
          );
          return [];
        }
        return [];
      }

      const data = await response.json();
      return this.normalizePlanningLines(data.value || []);
    } catch (error) {
      console.error('[BC API] Error fetching job planning lines:', error);
      return [];
    }
  }

  // Resource Units of Measure - conversion factors for time units
  // Requires Thyme BC Extension v1.7.0+
  /**
   * Get every resource's units of measure (e.g. DAY = 7.5 HOURS).
   * By default failures return [] so read-only views degrade gracefully. Pass
   * `{ strict: true }` when the result is used to write quantities back to BC:
   * a real failure then throws instead of silently treating every unit as hours.
   * (No extension, or an old extension without the endpoint, still returns [].)
   */
  async getResourceUnitsOfMeasure(
    options: { strict?: boolean } = {}
  ): Promise<BCResourceUnitOfMeasure[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) {
        if (options.strict) throw new Error('No Business Central access token');
        return [];
      }

      const url = `${this.customApiBaseUrl}/resourceUnitsOfMeasure`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            '[BC API] resourceUnitsOfMeasure endpoint not found. Upgrade Thyme BC Extension to v1.7.0+.'
          );
          return [];
        }
        if (options.strict) {
          throw new Error(`Failed to load resource units of measure (HTTP ${response.status})`);
        }
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('[BC API] Error fetching resource units of measure:', error);
      if (options.strict) throw error;
      return [];
    }
  }

  // Get Job Planning Lines for a specific resource/task/week
  // Used to pre-load existing allocations when editing
  async getJobPlanningLinesForWeek(params: {
    jobNo: string;
    jobTaskNo: string;
    resourceNo: string;
    weekStart: string; // YYYY-MM-DD
    weekEnd: string; // YYYY-MM-DD
  }): Promise<BCJobPlanningLine[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) return [];

      // Build OData filter for resource, task, and date range
      const escapedJobNo = this.sanitizeODataString(params.jobNo);
      const escapedTaskNo = this.sanitizeODataString(params.jobTaskNo);
      const escapedResourceNo = this.sanitizeODataString(params.resourceNo);
      const weekStart = this.sanitizeDateInput(params.weekStart);
      const weekEnd = this.sanitizeDateInput(params.weekEnd);
      const filter = `jobNo eq '${escapedJobNo}' and jobTaskNo eq '${escapedTaskNo}' and number eq '${escapedResourceNo}' and planningDate ge ${weekStart} and planningDate le ${weekEnd}`;

      const url = `${this.customApiBaseUrl}/jobPlanningLines?$filter=${encodeURIComponent(filter)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            '[BC API] jobPlanningLines endpoint not found. Upgrade Thyme BC Extension to v1.6.0+.'
          );
          return [];
        }
        return [];
      }

      const data = await response.json();
      return this.normalizePlanningLines(data.value || []);
    } catch (error) {
      console.error('[BC API] Error fetching job planning lines for week:', error);
      return [];
    }
  }

  // Get ALL Job Planning Lines for a resource in a week (across all projects)
  // Used to show resource workload/availability when allocating
  async getResourceWorkloadForWeek(params: {
    resourceNo: string;
    weekStart: string; // YYYY-MM-DD
    weekEnd: string; // YYYY-MM-DD
  }): Promise<BCJobPlanningLine[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) return [];

      const escapedResourceNo = this.sanitizeODataString(params.resourceNo);
      const weekStart = this.sanitizeDateInput(params.weekStart);
      const weekEnd = this.sanitizeDateInput(params.weekEnd);
      const filter = `number eq '${escapedResourceNo}' and planningDate ge ${weekStart} and planningDate le ${weekEnd}`;

      const url = `${this.customApiBaseUrl}/jobPlanningLines?$filter=${encodeURIComponent(filter)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            '[BC API] jobPlanningLines endpoint not found. Upgrade Thyme BC Extension to v1.6.0+.'
          );
          return [];
        }
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('[BC API] Error fetching resource workload for week:', error);
      return [];
    }
  }

  // Create Job Planning Line - requires Thyme BC Extension v1.8.0+
  // Creates a new planning line for resource allocation
  async createJobPlanningLine(params: {
    jobNo: string;
    jobTaskNo: string;
    resourceNo: string;
    planningDate: string; // YYYY-MM-DD
    quantity: number;
    lineType?: 'Budget' | 'Billable' | 'Both Budget and Billable';
    unitOfMeasureCode?: string; // e.g., 'HOUR' or 'DAY'
  }): Promise<BCJobPlanningLine | null> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      const { ExtensionNotInstalledError } = await import('./timeEntryService');
      throw new ExtensionNotInstalledError();
    }

    try {
      const token = await getBCAccessToken();
      if (!token) {
        throw new Error('Failed to get access token');
      }

      // Validate date format
      const sanitizedDate = this.sanitizeDateInput(params.planningDate);
      if (!sanitizedDate) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD.');
      }

      const url = `${this.customApiBaseUrl}/jobPlanningLines`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jobNo: params.jobNo,
          jobTaskNo: params.jobTaskNo,
          type: 'Resource',
          number: params.resourceNo,
          planningDate: sanitizedDate,
          quantity: params.quantity,
          lineType: params.lineType || 'Budget',
          ...(params.unitOfMeasureCode && { unitOfMeasureCode: params.unitOfMeasureCode }),
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            'Job Planning Lines API not found. Upgrade Thyme BC Extension to v1.8.0+.'
          );
        }
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData?.error?.message || `Failed to create planning line (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[BC API] Error creating job planning line:', error);
      throw error;
    }
  }

  /**
   * Update a job planning line - requires Thyme BC Extension v1.8.0+
   * @param id - The SystemId (GUID) of the planning line to update
   * @param params - The fields to update (quantity, etc.)
   * @param etag - The @odata.etag value for optimistic concurrency (required by BC)
   */
  async updateJobPlanningLine(
    id: string,
    params: {
      quantity?: number;
      planningDate?: string;
    },
    etag?: string
  ): Promise<BCJobPlanningLine | null> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      const { ExtensionNotInstalledError } = await import('./timeEntryService');
      throw new ExtensionNotInstalledError();
    }

    try {
      const token = await getBCAccessToken();
      if (!token) {
        throw new Error('Failed to get access token');
      }

      // Use SystemId (GUID) as the key - this is the standard BC API pattern
      const url = `${this.customApiBaseUrl}/jobPlanningLines(${id})`;

      const updateBody: Record<string, unknown> = {};
      if (params.quantity !== undefined) {
        updateBody.quantity = params.quantity;
      }
      if (params.planningDate) {
        updateBody.planningDate = this.sanitizeDateInput(params.planningDate);
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      // BC requires If-Match header with ETag for PATCH operations
      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updateBody),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            'Job Planning Line not found or update not supported. Try deleting and recreating.'
          );
        }
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData?.error?.message || `Failed to update planning line (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[BC API] Error updating job planning line:', error);
      throw error;
    }
  }

  /**
   * Delete a job planning line - requires Thyme BC Extension v1.8.0+
   * @param id - The SystemId (GUID) of the planning line to delete
   * @param etag - The @odata.etag value for optimistic concurrency (required by BC)
   */
  async deleteJobPlanningLine(id: string, etag?: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      const { ExtensionNotInstalledError } = await import('./timeEntryService');
      throw new ExtensionNotInstalledError();
    }

    try {
      const token = await getBCAccessToken();
      if (!token) {
        throw new Error('Failed to get access token');
      }

      // Use SystemId (GUID) as the key - this is the standard BC API pattern
      const url = `${this.customApiBaseUrl}/jobPlanningLines(${id})`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };
      // BC requires If-Match header with ETag for DELETE operations
      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Already deleted or doesn't exist - treat as success
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData?.error?.message || `Failed to delete planning line (${response.status})`;
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('[BC API] Error deleting job planning line:', error);
      throw error;
    }
  }

  // Time Entries - requires Thyme BC Extension v1.7.0+
  // Provides posted time entries from Job Ledger Entry (actual cost and invoiced price)
  async getTimeEntries(jobNumber: string): Promise<BCTimeEntry[]> {
    // Check if extension is installed
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      return [];
    }

    try {
      const token = await getBCAccessToken();
      if (!token) return [];

      const escapedJobNumber = this.sanitizeODataString(jobNumber);
      const filter = `jobNo eq '${escapedJobNumber}'`;
      const url = `${this.customApiBaseUrl}/timeEntries?$filter=${encodeURIComponent(filter)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        // 404 means the endpoint doesn't exist (extension too old)
        if (response.status === 404) {
          console.warn(
            '[BC API] timeEntries endpoint not found. Upgrade Thyme BC Extension to v1.7.0+.'
          );
          return [];
        }
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('[BC API] Error fetching time entries:', error);
      return [];
    }
  }

  // Resources (Users/Employees) - uses custom Thyme API
  async getResources(filter?: string): Promise<BCResource[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      // Import dynamically to avoid circular dependency
      const { ExtensionNotInstalledError } = await import('./timeEntryService');
      throw new ExtensionNotInstalledError();
    }

    let endpoint = "/resources?$filter=type eq 'Person'";
    if (filter) {
      endpoint += ` and ${filter}`;
    }
    const response = await this.customApiFetch<PaginatedResponse<BCResource>>(endpoint);
    return response.value;
  }

  async getResource(resourceId: string): Promise<BCResource> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      const { ExtensionNotInstalledError } = await import('./timeEntryService');
      throw new ExtensionNotInstalledError();
    }
    return this.customApiFetch<BCResource>(`/resources(${resourceId})`);
  }

  /**
   * Set a resource's own billable target, or clear it (null) so they fall back to the
   * company default. Reads the resource first for a fresh ETag, as BC requires If-Match.
   * Needs a Thyme BC Extension with billable targets; BC decides who may change them.
   */
  async updateResourceBillableTarget(
    resourceId: string,
    targetPercent: number | null
  ): Promise<BCResource> {
    const id = requireSystemId(resourceId, 'resource');
    const body =
      targetPercent === null
        ? { billableTargetSet: false }
        : { billableTargetPercent: requireTargetPercent(targetPercent), billableTargetSet: true };
    // Read and write the same company even if the user switches company meanwhile
    const baseUrl = this.customApiBaseUrl;
    const current = await this.customApiFetch<BCResource>(`/resources(${id})`, {}, baseUrl);
    const etag = requireETag(current['@odata.etag'], 'resource');
    return this.customApiFetch<BCResource>(
      `/resources(${id})`,
      { method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify(body) },
      baseUrl
    );
  }

  /**
   * Thyme's company-wide settings (a single record), or null when the installed
   * Thyme BC Extension predates them (404) or isn't installed.
   */
  async getThymeSetup(): Promise<BCThymeSetup | null> {
    const baseUrl = this.customApiBaseUrl;
    if (!(await this.isExtensionInstalled())) return null;
    return this.fetchThymeSetup(baseUrl);
  }

  /** The thymeSetup record for the company at `baseUrl`, or null on a 404 */
  private async fetchThymeSetup(baseUrl: string): Promise<BCThymeSetup | null> {
    try {
      const response = await this.customApiFetch<PaginatedResponse<BCThymeSetup> | BCThymeSetup>(
        '/thymeSetup',
        {},
        baseUrl
      );
      const setup = 'value' in response ? response.value[0] : response;
      return setup?.id ? setup : null;
    } catch (error) {
      // An extension without Thyme Setup; any other failure is a real error
      if (isEndpointMissing(error)) return null;
      throw error;
    }
  }

  /** Change the company default billable target (0-100) on the thymeSetup record */
  async updateDefaultBillableTarget(targetPercent: number): Promise<BCThymeSetup> {
    const percent = requireTargetPercent(targetPercent);
    // Read and write the same company even if the user switches company meanwhile
    const baseUrl = this.customApiBaseUrl;
    const current = await this.fetchThymeSetup(baseUrl);
    if (!current) {
      throw new Error('BC API Error (404): Billable targets need a newer Thyme BC Extension');
    }
    const etag = requireETag(current['@odata.etag'], 'Thyme Setup');
    const id = requireSystemId(current.id, 'Thyme Setup');
    return this.customApiFetch<BCThymeSetup>(
      `/thymeSetup(${id})`,
      {
        method: 'PATCH',
        headers: { 'If-Match': etag },
        body: JSON.stringify({ defaultBillableTargetPercent: percent }),
      },
      baseUrl
    );
  }

  /**
   * Derive the BC User ID from an Azure AD username (UPN).
   * Azure AD UPN is typically "ben.weeks@domain.com"
   * BC User ID is typically "BEN.WEEKS" (uppercase, before @)
   */
  deriveBCUserId(azureAdUsername: string): string {
    // Extract the part before @ and uppercase it
    const localPart = azureAdUsername.split('@')[0];
    return localPart.toUpperCase();
  }

  /**
   * Find a resource for the current user.
   * @param azureAdUsername - The user's Azure AD username (UPN), e.g., "ben.weeks@domain.com"
   *
   * Derives the BC User ID from the Azure AD username and filters resources
   * by timeSheetOwnerUserId.
   */
  async getResourceForCurrentUser(azureAdUsername: string): Promise<BCResource | null> {
    try {
      // Derive BC User ID from Azure AD username
      const bcUserId = this.deriveBCUserId(azureAdUsername);

      // Find resource where timeSheetOwnerUserId matches
      const response = await this.customApiFetch<PaginatedResponse<BCResource>>(
        `/resources?$filter=timeSheetOwnerUserId eq '${bcUserId}'`
      );
      return response.value[0] || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // Check if the endpoint itself doesn't exist (extension not installed/outdated)
        // vs no resource found for the user
        if (error.message.includes('No HTTP resource was found')) {
          // Import dynamically to avoid circular dependency
          const { ExtensionNotInstalledError } = await import('./timeEntryService');
          throw new ExtensionNotInstalledError();
        }
        // Otherwise, no resource found for user
        return null;
      }
      throw error;
    }
  }

  /**
   * @deprecated Use getResourceForCurrentUser(azureAdUsername) instead.
   */
  async getResourceByEmail(email: string): Promise<BCResource | null> {
    return this.getResourceForCurrentUser(email);
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

  /**
   * GET a custom API collection, following @odata.nextLink so large result sets
   * aren't silently truncated at BC's page size.
   */
  private async customApiFetchAll<T>(endpoint: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = endpoint;
    while (next) {
      const response: PaginatedResponse<T> = await this.customApiFetch<PaginatedResponse<T>>(next);
      items.push(...response.value);
      const nextLink = response['@odata.nextLink'];
      if (!nextLink) break;
      // Resolve relative links against the current page, and only follow links back into
      // the same custom API (the request carries the BC bearer token)
      const resolved: string = new URL(nextLink, `${this.customApiBaseUrl}${next}`).href;
      if (!resolved.startsWith(this.customApiBaseUrl)) {
        throw new Error('Unexpected @odata.nextLink outside the Business Central API');
      }
      next = resolved.slice(this.customApiBaseUrl.length);
    }
    return items;
  }

  /**
   * @param baseUrl - The company's custom API URL; pass one captured earlier to keep a
   * read-then-write pair on the same company even if the selection changes in between
   */
  private async customApiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl: string = this.customApiBaseUrl
  ): Promise<T> {
    const token = await getBCAccessToken();

    if (!token) {
      throw new Error('Failed to get Business Central access token');
    }

    const url = `${baseUrl}${endpoint}`;

    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development' && options.body) {
      console.log('[BC API] POST/PATCH body:', options.body);
    }

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
      // Only log unexpected errors in development (skip expected 404s for missing endpoints)
      if (process.env.NODE_ENV === 'development') {
        const isExpected404 =
          response.status === 404 && errorText.includes('No HTTP resource was found');
        if (!isExpected404) {
          console.error('[BC API] Error response:', errorText);
        }
      }
      throw new Error(`BC API Error (${response.status}): ${errorText}`);
    }

    // Handle 204 No Content or empty body
    if (response.status === 204) {
      return {} as T;
    }

    // Check for empty body (some BC actions return 200 with no content)
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('[BC API] Failed to parse JSON response:', text);
      throw new Error(`BC API: Invalid JSON response: ${text.substring(0, 100)}`);
    }
  }

  // ============================================
  // Time Suggestions (Poppie)
  // ============================================

  /**
   * Get Poppie's pending time suggestions for a resource within a date range.
   * Returns null when the extension doesn't have the timeSuggestions endpoint yet
   * (or isn't installed), so callers can hide the feature rather than show an error.
   * @param resourceNo - The resource number (employee)
   * @param fromDate - First date, inclusive (YYYY-MM-DD)
   * @param toDate - Last date, inclusive (YYYY-MM-DD)
   */
  async getTimeSuggestions(
    resourceNo: string,
    fromDate: string,
    toDate: string
  ): Promise<BCTimeSuggestion[] | null> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) return null;

    const escapedResourceNo = this.sanitizeODataString(resourceNo);
    const from = this.sanitizeDateInput(fromDate);
    const to = this.sanitizeDateInput(toDate);
    const filter = `resourceNo eq '${escapedResourceNo}' and date ge ${from} and date le ${to} and status eq 'Pending'`;

    try {
      return await this.customApiFetchAll<BCTimeSuggestion>(
        `/timeSuggestions?$filter=${encodeURIComponent(filter)}`
      );
    } catch (error) {
      // 404 on the collection means the endpoint doesn't exist (extension too old)
      if (error instanceof Error && error.message.startsWith('BC API Error (404)')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update a time suggestion's status (accept, dismiss or restore).
   * @param id - The SystemId (GUID) of the suggestion
   * @param updates - Status plus, when accepting, the timesheet line it became
   * @param etag - The @odata.etag value for optimistic concurrency (required by BC)
   * @returns The updated suggestion, including its new ETag
   */
  async updateTimeSuggestion(
    id: string,
    updates: BCTimeSuggestionUpdate,
    etag?: string
  ): Promise<BCTimeSuggestion> {
    return this.customApiFetch<BCTimeSuggestion>(`/timeSuggestions(${id})`, {
      method: 'PATCH',
      headers: {
        'If-Match': etag || '*',
      },
      body: JSON.stringify(updates),
    });
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
   * Everyone's timesheets (that the user can see) starting between two dates, inclusive
   * (YYYY-MM-DD): one request for a whole team's week or month.
   */
  async getTimeSheetsStartingBetween(fromDate: string, toDate: string): Promise<BCTimeSheet[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error(
        'Thyme BC Extension is not installed. Timesheet functionality requires the extension.'
      );
    }
    const filter = `startingDate ge ${fromDate} and startingDate le ${toDate}`;
    return this.customApiFetchAll<BCTimeSheet>(`/timeSheets?$filter=${encodeURIComponent(filter)}`);
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
   * Delete a timesheet. Use with caution - this permanently removes the timesheet.
   * Typically used for cleaning up invalid/corrupt timesheet data.
   */
  async deleteTimeSheet(timeSheetId: string, etag: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    await this.customApiFetch(`/timeSheets(${timeSheetId})`, {
      method: 'DELETE',
      headers: {
        'If-Match': etag,
      },
    });
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

  // Poppie's timesheet reviews - requires the Thyme BC Extension review tables.
  // Both return null when the endpoint doesn't exist (extension not installed or too old),
  // so callers can hide the feature rather than show an error. They skip the cached
  // isExtensionInstalled() check on purpose: a transient failure there is cached as
  // "not installed", whereas a failed request here stays retryable.

  /**
   * Get the reviews for one or more timesheets in a single query, newest first.
   * A timesheet can have several reviews (one per version Poppie saw).
   */
  async getTimesheetReviews(timeSheetNos: string[]): Promise<BCTimesheetReview[] | null> {
    if (timeSheetNos.length === 0) return [];

    const filter = timeSheetNos
      .map((no) => `timeSheetNo eq '${this.sanitizeODataString(no)}'`)
      .join(' or ');
    try {
      return await this.customApiFetchAll<BCTimesheetReview>(
        `/timesheetReviews?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('reviewedAt desc')}`
      );
    } catch (error) {
      if (isEndpointMissing(error)) {
        console.warn(
          '[BC API] timesheetReviews endpoint not found. Update the Thyme BC Extension to see reviews.'
        );
        return null;
      }
      throw error;
    }
  }

  /**
   * Get the line notes for one or more reviews in a single query.
   */
  async getTimesheetReviewLines(reviewEntryNos: number[]): Promise<BCTimesheetReviewLine[] | null> {
    if (reviewEntryNos.length === 0) return [];

    const filter = reviewEntryNos
      .filter((entryNo) => Number.isInteger(entryNo))
      .map((entryNo) => `reviewEntryNo eq ${entryNo}`)
      .join(' or ');
    if (!filter) return [];
    try {
      return await this.customApiFetchAll<BCTimesheetReviewLine>(
        `/timesheetReviewLines?$filter=${encodeURIComponent(filter)}`
      );
    } catch (error) {
      if (isEndpointMissing(error)) return null;
      throw error;
    }
  }

  /**
   * Get every resource's timesheets in one query, optionally only those starting on or
   * after a date (YYYY-MM-DD).
   */
  async getTimeSheetsFrom(fromDate?: string): Promise<BCTimeSheet[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    if (!fromDate) return this.customApiFetchAll<BCTimeSheet>('/timeSheets');
    const filter = `startingDate ge ${this.sanitizeDateInput(fromDate)}`;
    return this.customApiFetchAll<BCTimeSheet>(`/timeSheets?$filter=${encodeURIComponent(filter)}`);
  }

  /**
   * Get every timesheet line for a project (across all timesheets) in one query,
   * optionally only from timesheets starting on or after a date (YYYY-MM-DD).
   */
  async getTimeSheetLinesForJob(jobNo: string, fromDate?: string): Promise<BCTimeSheetLine[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const escaped = jobNo.replace(/'/g, "''");
    let filter = `jobNo eq '${escaped}'`;
    if (fromDate) filter += ` and timeSheetStartingDate ge ${this.sanitizeDateInput(fromDate)}`;
    return this.customApiFetchAll<BCTimeSheetLine>(
      `/timeSheetLines?$filter=${encodeURIComponent(filter)}`
    );
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

    const result = await this.customApiFetch<BCTimeSheetLine>('/timeSheetLines', {
      method: 'POST',
      body: JSON.stringify(line),
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[BC API] createTimeSheetLine response:', JSON.stringify(result));
    }
    return result;
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

  // ============================================
  // Timesheet Details API
  // ============================================

  /**
   * Get timesheet details for a specific line.
   */
  async getTimeSheetDetails(timeSheetNo: string, lineNo: number): Promise<BCTimeSheetDetail[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const escapedNo = timeSheetNo.replace(/'/g, "''");
    const filter = encodeURIComponent(
      `timeSheetNo eq '${escapedNo}' and timeSheetLineNo eq ${lineNo}`
    );
    const response = await this.customApiFetch<PaginatedResponse<BCTimeSheetDetail>>(
      `/timeSheetDetails?$filter=${filter}`
    );
    return response.value;
  }

  /**
   * Get every timesheet detail (daily hours) for a project in one query,
   * optionally only on or after a date (YYYY-MM-DD).
   */
  async getTimeSheetDetailsForJob(jobNo: string, fromDate?: string): Promise<BCTimeSheetDetail[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const escaped = jobNo.replace(/'/g, "''");
    let filter = `jobNo eq '${escaped}'`;
    if (fromDate) filter += ` and date ge ${this.sanitizeDateInput(fromDate)}`;
    return this.customApiFetchAll<BCTimeSheetDetail>(
      `/timeSheetDetails?$filter=${encodeURIComponent(filter)}`
    );
  }

  /**
   * Get all timesheet details for a timesheet (across all lines).
   */
  async getAllTimeSheetDetails(timeSheetNo: string): Promise<BCTimeSheetDetail[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const escapedNo = timeSheetNo.replace(/'/g, "''");
    const filter = encodeURIComponent(`timeSheetNo eq '${escapedNo}'`);
    const response = await this.customApiFetch<PaginatedResponse<BCTimeSheetDetail>>(
      `/timeSheetDetails?$filter=${filter}`
    );
    return response.value;
  }

  /**
   * Set hours for a specific date on a timesheet line.
   * Uses the bound action on /timeSheetLines.
   * @param lineId - The GUID of the timesheet line (id field, not lineNo)
   * @param entryDate - The date to set hours for (ISO format YYYY-MM-DD)
   * @param hours - The number of hours to set
   */
  async setHoursForDate(lineId: string, entryDate: string, hours: number): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const url = `/timeSheetLines(${lineId})/Microsoft.NAV.setHoursForDate`;
    if (process.env.NODE_ENV === 'development') {
      console.log('[BC API] setHoursForDate URL:', url);
    }

    await this.customApiFetch(url, {
      method: 'POST',
      body: JSON.stringify({ entryDate, hours }),
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
   * Create a new timesheet for a resource.
   * @param resourceNo - The resource number (employee)
   * @param startingDate - The week starting date (YYYY-MM-DD, must be a Monday)
   * @returns The created timesheet
   */
  async createTimeSheet(resourceNo: string, startingDate: string): Promise<BCTimeSheet> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    // Validate and sanitize date input to prevent OData injection
    const sanitizedDate = this.sanitizeDateInput(startingDate);
    const sanitizedResourceNo = this.sanitizeODataString(resourceNo);

    return this.customApiFetch<BCTimeSheet>('/timeSheets', {
      method: 'POST',
      body: JSON.stringify({
        resourceNo: sanitizedResourceNo,
        startingDate: sanitizedDate,
      }),
    });
  }

  /**
   * Create timesheets for multiple resources for a given week.
   * @param resourceNos - Array of resource numbers
   * @param startingDate - The week starting date (YYYY-MM-DD, must be a Monday)
   * @returns Array of results with success/failure for each resource
   */
  async createTimeSheetsForResources(
    resourceNos: string[],
    startingDate: string
  ): Promise<
    Array<{ resourceNo: string; success: boolean; timesheet?: BCTimeSheet; error?: string }>
  > {
    const results = await Promise.all(
      resourceNos.map(async (resourceNo) => {
        try {
          const timesheet = await this.createTimeSheet(resourceNo, startingDate);
          return { resourceNo, success: true, timesheet };
        } catch (error) {
          return {
            resourceNo,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );
    return results;
  }

  /**
   * Derive a display-friendly status from timesheet FlowFields.
   * Delegates to shared utility function.
   */
  getTimesheetDisplayStatus(timesheet: BCTimeSheet): TimesheetDisplayStatus {
    return getTimesheetDisplayStatus(timesheet);
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

  // ============================================
  // Approval Workflow API (requires Thyme BC Extension)
  // ============================================

  /**
   * Get time sheets pending approval for the current user.
   * Filters for timesheets where submittedExists is true and not yet approved.
   * Used for dashboard KPI stats.
   */
  async getPendingApprovals(): Promise<BCTimeSheet[]> {
    // Filter for submitted but not approved timesheets (pending approval)
    const filter = 'submittedExists eq true and approvedExists eq false';
    return this.getApproverTimesheets(filter);
  }

  /**
   * Get all time sheets visible to the current approver.
   * Used for the approvals list with client-side filtering.
   */
  async getAllApproverTimesheets(): Promise<BCTimeSheet[]> {
    // No filter - fetch all timesheets the approver can see
    return this.getApproverTimesheets();
  }

  /**
   * Internal method to fetch timesheets with optional OData filter.
   */
  private async getApproverTimesheets(filter?: string): Promise<BCTimeSheet[]> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    const endpoint = filter ? `/timeSheets?$filter=${encodeURIComponent(filter)}` : '/timeSheets';
    const response = await this.customApiFetch<PaginatedResponse<BCTimeSheet>>(endpoint);
    const timeSheets = response.value;

    // Fetch resources to populate resourceName and resourceEmail
    if (timeSheets.length > 0) {
      try {
        const resources = await this.getResources();
        const resourceMap = new Map(
          resources.map((r) => [r.number, { name: r.name, ownerId: r.timeSheetOwnerUserId }])
        );

        // Populate resourceName and prepare for email lookup
        timeSheets.forEach((ts) => {
          const resource = resourceMap.get(ts.resourceNo);
          if (resource) {
            if (!ts.resourceName) {
              ts.resourceName = resource.name || ts.resourceNo;
            }
            // Store the BC user ID - will be converted to email in the UI
            if (resource.ownerId) {
              // BC User ID is uppercase (e.g., "BEN.WEEKS")
              // Store as-is, UI will add domain
              ts.resourceEmail = resource.ownerId.toLowerCase();
            }
          } else if (!ts.resourceName) {
            ts.resourceName = ts.resourceNo;
          }
        });
      } catch {
        // If resource lookup fails, fall back to resourceNo as name
        timeSheets.forEach((ts) => {
          if (!ts.resourceName) {
            ts.resourceName = ts.resourceNo;
          }
        });
      }
    }

    return timeSheets;
  }

  /**
   * Approve specific time sheet lines.
   * Uses the approveLines bound action on timeSheetLines.
   */
  async approveTimeSheetLines(lineIds: string[], comment?: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    // Approve each line individually using the bound action
    for (const lineId of lineIds) {
      await this.customApiFetch(`/timeSheetLines(${lineId})/Microsoft.NAV.approve`, {
        method: 'POST',
      });
    }
  }

  /**
   * Reject specific time sheet lines.
   * Uses the rejectLines bound action on timeSheetLines.
   */
  async rejectTimeSheetLines(lineIds: string[], comment: string): Promise<void> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new Error('Thyme BC Extension is not installed.');
    }

    // Reject each line individually using the bound action
    for (const lineId of lineIds) {
      await this.customApiFetch(`/timeSheetLines(${lineId})/Microsoft.NAV.reject`, {
        method: 'POST',
      });
    }
  }

  /**
   * Check if the current user has approval permissions.
   * Attempts to fetch pending approvals - if successful, user is an approver.
   * Throws ExtensionNotInstalledError if extension is not installed.
   */
  async checkApprovalPermission(): Promise<{ isApprover: boolean; resourceNumber?: string }> {
    const extensionInstalled = await this.isExtensionInstalled();
    if (!extensionInstalled) {
      throw new ExtensionNotInstalledError();
    }

    try {
      // Try to fetch pending approvals - if this succeeds without error, user has approval access
      // BC will return 403 or similar if user doesn't have permission
      await this.getPendingApprovals();
      // If we got here without error, the user can access the approvals endpoint
      return { isApprover: true };
    } catch {
      // If fetching fails (403, 401, etc.), user doesn't have approval permission
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
      const pendingHours = pendingSheets.reduce(
        (sum, sheet) => sum + (sheet.totalQuantity || 0),
        0
      );
      return { pendingCount, pendingHours };
    } catch {
      return { pendingCount: 0, pendingHours: 0 };
    }
  }
}

export const bcClient = new BusinessCentralClient();
