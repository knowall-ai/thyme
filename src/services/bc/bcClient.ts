import { getBCAccessToken } from '../auth';
import type {
  BCJob,
  BCJobTask,
  BCJobJournalLine,
  BCResource,
  PaginatedResponse,
} from '@/types';

const BC_BASE_URL = process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0';
const BC_ENVIRONMENT = process.env.BC_ENVIRONMENT || 'sandbox';
const BC_COMPANY_ID = process.env.BC_COMPANY_ID || '';

class BusinessCentralClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${BC_BASE_URL}/${BC_ENVIRONMENT}/api/v2.0/companies(${BC_COMPANY_ID})`;
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
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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

  // Jobs (Projects)
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

  // Job Tasks
  async getJobTasks(jobNumber: string): Promise<BCJobTask[]> {
    const filter = `jobNumber eq '${jobNumber}'`;
    const endpoint = `/jobTaskLines?$filter=${encodeURIComponent(filter)}`;
    const response = await this.fetch<PaginatedResponse<BCJobTask>>(endpoint);
    return response.value;
  }

  async getJobTask(jobTaskId: string): Promise<BCJobTask> {
    return this.fetch<BCJobTask>(`/jobTaskLines(${jobTaskId})`);
  }

  // Resources (Users/Employees)
  async getResources(filter?: string): Promise<BCResource[]> {
    let endpoint = '/resources?$filter=type eq \'Person\'';
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

  async createJobJournalLine(line: Omit<BCJobJournalLine, 'id' | 'lineNumber'>): Promise<BCJobJournalLine> {
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
  async postJobJournal(
    journalTemplateName: string,
    journalBatchName: string
  ): Promise<void> {
    // This typically requires a custom API endpoint or action in BC
    // The standard API doesn't directly support posting journals
    // You would need to create a custom API page in BC for this
    await this.fetch(`/jobJournals(${journalTemplateName},${journalBatchName})/Microsoft.NAV.post`, {
      method: 'POST',
    });
  }
}

export const bcClient = new BusinessCentralClient();
