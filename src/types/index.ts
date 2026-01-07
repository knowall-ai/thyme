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
export type BCEnvironmentType = 'sandbox' | 'production';

export interface BCCompany {
  id: string;
  name: string;
  displayName: string;
  businessProfileId?: string;
  environment?: BCEnvironmentType;
}

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

export interface BCCustomer {
  id: string;
  number: string;
  displayName: string;
  email?: string;
  phoneNumber?: string;
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
  jobNo: string;
  jobTaskNo: string;
  description: string;
  jobTaskType: 'Posting' | 'Heading' | 'Total' | 'Begin-Total' | 'End-Total';
}

// Extended project data from the Thyme BC Extension API
// See: https://github.com/knowall-ai/thyme-bc-extension
export interface BCExtendedProject {
  id: string;
  no: string;
  description: string;
  billToCustomerNo: string;
  billToCustomerName: string;
  personResponsible: string;
  status: 'Planning' | 'Quote' | 'Open' | 'Completed';
  startingDate: string;
  endingDate: string;
  lastModifiedDateTime: string;
}

// Extended job task with budget/actual hours from the Thyme BC Extension
export interface BCExtendedJobTask {
  id: string;
  jobNo: string;
  jobTaskNo: string;
  description: string;
  jobTaskType: 'Posting' | 'Heading' | 'Total' | 'Begin-Total' | 'End-Total';
  budgetTotalCost: number;
  budgetTotalPrice: number;
  usageTotalCost: number;
  usageTotalPrice: number;
  scheduleTotalCost: number;
  scheduleTotalPrice: number;
}

// Time entry from Job Ledger (posted time entries)
export interface BCTimeEntry {
  id: string;
  entryNo: number;
  jobNo: string;
  jobTaskNo: string;
  postingDate: string;
  documentNo: string;
  type: 'Resource' | 'Item' | 'G/L Account';
  no: string;
  description: string;
  quantity: number;
  unitOfMeasureCode: string;
  totalCost: number;
  totalPrice: number;
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
  customerName?: string;
  color: string;
  status: 'active' | 'completed' | 'archived';
  isFavorite: boolean;
  tasks: Task[];
}

// Extended project with additional details (when BC extension is available)
export interface ExtendedProject extends Project {
  customerNo?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
  bcStatus?: 'Planning' | 'Quote' | 'Open' | 'Completed';
  budgetHours?: number;
  usageHours?: number;
  remainingHours?: number;
  budgetCost?: number;
  usageCost?: number;
}

export interface ExtendedTask extends Task {
  budgetHours?: number;
  usageHours?: number;
  budgetCost?: number;
  usageCost?: number;
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
