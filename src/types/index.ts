// UI types
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  displayName: string;
  avatar?: string;
}

// Business Central types
export interface BCResource {
  id: string;
  number: string;
  displayName: string;
  type: 'Person' | 'Machine';
  email?: string;
}

export interface BCJob {
  id: string;
  number: string;
  description: string;
  status: 'Open' | 'Completed' | 'Planning';
  billToCustomerNumber?: string;
  billToCustomerName?: string;
  startDate?: string;
  endDate?: string;
}

export interface BCProject {
  id: string;
  number: string;
  displayName: string;
  lastModifiedDateTime?: string;
}

export interface BCEmployee {
  id: string;
  number: string;
  displayName: string;
  givenName: string;
  surname: string;
  jobTitle: string;
  email?: string;
  status: 'Active' | 'Inactive';
  lastModifiedDateTime?: string;
}

export interface BCJobTask {
  id: string;
  jobNumber: string;
  taskNumber: string;
  description: string;
  jobTaskType: 'Posting' | 'Heading' | 'Total' | 'Begin-Total' | 'End-Total';
}

export interface BCJobJournalLine {
  id?: string;
  journalTemplateName: string;
  journalBatchName: string;
  lineNumber?: number;
  documentNumber?: string;
  postingDate: string;
  type: 'Resource';
  number: string;
  jobNumber: string;
  jobTaskNumber: string;
  description: string;
  quantity: number;
  unitOfMeasureCode: string;
  unitCost?: number;
  totalCost?: number;
  unitPrice?: number;
  totalPrice?: number;
}

// Application types
export interface Project {
  id: string;
  code: string;
  name: string;
  clientName?: string;
  color: string;
  status: 'active' | 'completed' | 'archived';
  isFavorite: boolean;
  tasks: Task[];
}

export interface Task {
  id: string;
  projectId: string;
  code: string;
  name: string;
  isBillable: boolean;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  taskId: string;
  userId: string;
  date: string; // ISO date string
  hours: number;
  notes?: string;
  isBillable: boolean;
  isRunning: boolean;
  startTime?: string; // ISO timestamp for running timer
  createdAt: string;
  updatedAt: string;
  // Synced from BC
  bcJobJournalLineId?: string;
  syncStatus: 'pending' | 'synced' | 'error';
  // Azure DevOps work item linking
  devOpsWorkItemId?: number;
  devOpsWorkItemTitle?: string;
  devOpsOrganization?: string;
  devOpsProject?: string;
}

export interface TimerState {
  isRunning: boolean;
  projectId?: string;
  taskId?: string;
  notes?: string;
  startTime?: string;
  elapsedSeconds: number;
}

export interface WeekData {
  weekStart: Date;
  weekEnd: Date;
  entries: TimeEntry[];
  totalHours: number;
  dailyTotals: { [date: string]: number };
}

export interface UserSettings {
  defaultProjectId?: string;
  defaultTaskId?: string;
  weeklyHoursTarget: number;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  // Azure DevOps integration settings
  devOpsOrganization?: string;
  devOpsProject?: string;
}

// API Response types
export interface PaginatedResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

// Report types
export interface WeeklySummary {
  projectId: string;
  projectName: string;
  totalHours: number;
  billableHours: number;
  dailyBreakdown: { [date: string]: number };
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  projectIds?: string[];
  taskIds?: string[];
}

// Azure DevOps types
export interface DevOpsWorkItem {
  id: number;
  rev: number;
  url: string;
  fields: {
    'System.Id': number;
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.AssignedTo'?: {
      displayName: string;
      uniqueName: string;
    };
    'System.IterationPath'?: string;
    'System.AreaPath'?: string;
    'System.Description'?: string;
    'Microsoft.VSTS.Scheduling.CompletedWork'?: number;
    'Microsoft.VSTS.Scheduling.RemainingWork'?: number;
  };
}

export interface DevOpsWorkItemSearchResult {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo?: string;
}

export interface DevOpsProject {
  id: string;
  name: string;
  description?: string;
  url: string;
  state: string;
}
