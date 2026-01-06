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

// Extended project type from thyme-bc-extension
// See: https://github.com/knowall-ai/thyme-bc-extension
export interface BCProjectExtended extends BCProject {
  description?: string;
  billToCustomerNo?: string;
  billToCustomerName?: string;
  personResponsible?: string;
  status?: 'Planning' | 'Quote' | 'Open' | 'Completed';
  startingDate?: string;
  endingDate?: string;
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

// Time entry type from thyme-bc-extension /timeEntries endpoint
// See: https://github.com/knowall-ai/thyme-bc-extension/issues/2
export interface BCTimeEntry {
  id: string;
  entryNo: number;
  jobNo: string;
  jobTaskNo: string;
  postingDate: string;
  type: 'Resource' | 'Item' | 'G/L Account';
  no: string; // Resource/Item number
  description: string;
  quantity: number; // Hours for resources
  unitCost: number;
  totalCost: number;
  unitPrice: number;
  totalPrice: number;
  workTypeCode?: string;
  entryType: 'Usage' | 'Sale';
}

// Application types
export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  clientName?: string;
  clientCode?: string;
  projectManager?: string;
  color: string;
  status: 'active' | 'completed' | 'archived';
  startDate?: string;
  endDate?: string;
  isFavorite: boolean;
  tasks: Task[];
  // Indicates if extended data from thyme-bc-extension is available
  hasExtendedData?: boolean;
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
  // BC cost data (from thyme-bc-extension /timeEntries)
  unitCost?: number;
  totalCost?: number;
  unitPrice?: number;
  totalPrice?: number;
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
