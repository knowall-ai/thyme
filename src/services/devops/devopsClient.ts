import { getDevOpsAccessToken } from '../auth';
import type { DevOpsWorkItem, DevOpsWorkItemSearchResult, DevOpsProject } from '@/types';

const DEVOPS_BASE_URL = 'https://dev.azure.com';

export class AzureDevOpsClient {
  private organization: string;

  constructor(organization?: string) {
    this.organization = organization || process.env.NEXT_PUBLIC_DEVOPS_ORGANIZATION || '';
  }

  setOrganization(organization: string): void {
    this.organization = organization;
  }

  getOrganization(): string {
    return this.organization;
  }

  private async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = await getDevOpsAccessToken();

    if (!token) {
      throw new Error('Failed to get Azure DevOps access token');
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
      throw new Error(`DevOps API Error (${response.status}): ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Get all projects for the organization
  async getProjects(): Promise<DevOpsProject[]> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    const url = `${DEVOPS_BASE_URL}/${this.organization}/_apis/projects?api-version=7.1`;
    const response = await this.fetch<{ value: DevOpsProject[] }>(url);
    return response.value;
  }

  // Get a single work item by ID
  async getWorkItem(project: string, workItemId: number): Promise<DevOpsWorkItem> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.WorkItemType',
      'System.AssignedTo',
      'System.IterationPath',
      'System.AreaPath',
      'System.Description',
      'Microsoft.VSTS.Scheduling.CompletedWork',
      'Microsoft.VSTS.Scheduling.RemainingWork',
    ].join(',');

    const url = `${DEVOPS_BASE_URL}/${this.organization}/${project}/_apis/wit/workitems/${workItemId}?fields=${fields}&api-version=7.1`;
    return this.fetch<DevOpsWorkItem>(url);
  }

  // Get multiple work items by IDs
  async getWorkItems(project: string, workItemIds: number[]): Promise<DevOpsWorkItem[]> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    if (workItemIds.length === 0) {
      return [];
    }

    const fields = [
      'System.Id',
      'System.Title',
      'System.State',
      'System.WorkItemType',
      'System.AssignedTo',
    ].join(',');

    const ids = workItemIds.join(',');
    const url = `${DEVOPS_BASE_URL}/${this.organization}/${project}/_apis/wit/workitems?ids=${ids}&fields=${fields}&api-version=7.1`;
    const response = await this.fetch<{ value: DevOpsWorkItem[] }>(url);
    return response.value;
  }

  // Search work items using WIQL
  async searchWorkItems(
    project: string,
    searchText: string,
    maxResults: number = 20
  ): Promise<DevOpsWorkItemSearchResult[]> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    // Check if searchText is a work item ID (e.g., "#123" or "123")
    const idMatch = searchText.match(/^#?(\d+)$/);
    if (idMatch) {
      const workItemId = parseInt(idMatch[1], 10);
      try {
        const workItem = await this.getWorkItem(project, workItemId);
        return [this.mapWorkItemToSearchResult(workItem)];
      } catch {
        // Work item not found, continue with text search
      }
    }

    // Use WIQL to search for work items containing the search text
    const wiql = {
      query: `
        SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project}'
          AND ([System.Title] CONTAINS '${searchText}' OR [System.Description] CONTAINS '${searchText}')
          AND [System.State] <> 'Removed'
        ORDER BY [System.ChangedDate] DESC
      `,
    };

    const url = `${DEVOPS_BASE_URL}/${this.organization}/${project}/_apis/wit/wiql?api-version=7.1&$top=${maxResults}`;
    const response = await this.fetch<{ workItems: Array<{ id: number; url: string }> }>(url, {
      method: 'POST',
      body: JSON.stringify(wiql),
    });

    if (!response.workItems || response.workItems.length === 0) {
      return [];
    }

    // Get the work item details
    const workItemIds = response.workItems.map((wi) => wi.id);
    const workItems = await this.getWorkItems(project, workItemIds);

    return workItems.map(this.mapWorkItemToSearchResult);
  }

  // Get recently updated work items assigned to the current user
  async getMyRecentWorkItems(
    project: string,
    maxResults: number = 10
  ): Promise<DevOpsWorkItemSearchResult[]> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    const wiql = {
      query: `
        SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
        FROM WorkItems
        WHERE [System.TeamProject] = '${project}'
          AND [System.AssignedTo] = @Me
          AND [System.State] <> 'Removed'
          AND [System.State] <> 'Closed'
          AND [System.State] <> 'Done'
        ORDER BY [System.ChangedDate] DESC
      `,
    };

    const url = `${DEVOPS_BASE_URL}/${this.organization}/${project}/_apis/wit/wiql?api-version=7.1&$top=${maxResults}`;
    const response = await this.fetch<{ workItems: Array<{ id: number; url: string }> }>(url, {
      method: 'POST',
      body: JSON.stringify(wiql),
    });

    if (!response.workItems || response.workItems.length === 0) {
      return [];
    }

    const workItemIds = response.workItems.map((wi) => wi.id);
    const workItems = await this.getWorkItems(project, workItemIds);

    return workItems.map(this.mapWorkItemToSearchResult);
  }

  // Update completed work on a work item
  async updateCompletedWork(
    project: string,
    workItemId: number,
    hoursToAdd: number
  ): Promise<DevOpsWorkItem> {
    if (!this.organization) {
      throw new Error('Azure DevOps organization is not configured');
    }

    // First get the current completed work value
    const workItem = await this.getWorkItem(project, workItemId);
    const currentCompletedWork = workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0;
    const newCompletedWork = currentCompletedWork + hoursToAdd;

    const patchDocument = [
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork',
        value: newCompletedWork,
      },
    ];

    const url = `${DEVOPS_BASE_URL}/${this.organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
    return this.fetch<DevOpsWorkItem>(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    });
  }

  private mapWorkItemToSearchResult(workItem: DevOpsWorkItem): DevOpsWorkItemSearchResult {
    return {
      id: workItem.fields['System.Id'],
      title: workItem.fields['System.Title'],
      state: workItem.fields['System.State'],
      workItemType: workItem.fields['System.WorkItemType'],
      assignedTo: workItem.fields['System.AssignedTo']?.displayName,
    };
  }
}

// Export a singleton instance
export const devopsClient = new AzureDevOpsClient();
