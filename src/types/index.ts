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
  name: string; // BC field name (displayName alias)
  displayName?: string; // For compatibility
  type: 'Person' | 'Machine';
  baseUnitOfMeasure?: string;
  useTimeSheet?: boolean;
  timeSheetOwnerUserId?: string;
  timeSheetApproverUserId?: string;
  searchName?: string;
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

// Time Sheet status types
export type TimeSheetStatus = 'Open' | 'Submitted' | 'Rejected' | 'Approved' | 'Posted';

// Derived timesheet status for UI display
export type TimesheetDisplayStatus =
  | 'Open'
  | 'Partially Submitted'
  | 'Submitted'
  | 'Rejected'
  | 'Approved'
  | 'Mixed';

// BC Timesheet types (from Thyme BC Extension)
export interface BCTimeSheet {
  id: string;
  number: string;
  resourceNo: string;
  resourceName?: string;
  resourceEmail?: string; // Azure AD UPN for fetching profile photo
  startingDate: string;
  endingDate: string;
  approverUserId?: string;
  // Status FlowFields - individual lines have statuses, these aggregate
  openExists: boolean;
  submittedExists: boolean;
  rejectedExists: boolean;
  approvedExists: boolean;
  // Computed fields for approval workflow
  totalQuantity?: number;
  '@odata.etag'?: string;
}

export interface BCTimeSheetLine {
  id: string;
  timeSheetNo: string;
  lineNo: number;
  type: 'Resource' | 'Job' | 'Absence' | 'Assembly Order' | 'Service';
  jobNo?: string;
  jobTaskNo?: string;
  description?: string;
  totalQuantity: number;
  status: 'Open' | 'Submitted' | 'Rejected' | 'Approved';
  '@odata.etag'?: string;
}

// Time Sheet Detail - individual date/quantity records
export interface BCTimeSheetDetail {
  id: string;
  timeSheetNo: string;
  timeSheetLineNo: number;
  date: string; // ISO date format YYYY-MM-DD
  quantity: number;
  '@odata.etag'?: string;
}

// Approval workflow types
export interface PendingApproval {
  id: string;
  timeSheet: BCTimeSheet;
  lines: BCTimeSheetLine[];
  totalHours: number;
  submittedDate: string;
  employeeName: string;
  employeeEmail?: string;
}

export interface ApprovalAction {
  timeSheetId: string;
  lineIds?: string[]; // If empty, applies to all lines
  action: 'approve' | 'reject';
  comment?: string;
}

export interface ApprovalFilters {
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  status?: TimesheetDisplayStatus;
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

export interface Task {
  id: string;
  projectId: string;
  code: string;
  name: string;
  isBillable: boolean;
}

export interface TimeEntry {
  id: string; // Composite ID: {lineId}_{date}
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
  // BC Timesheet Line reference
  bcTimeSheetLineId?: string;
  bcTimeSheetNo?: string;
  lineStatus?: 'Open' | 'Submitted' | 'Rejected' | 'Approved';
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
