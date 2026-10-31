import type { StageHours } from '@/utils/timesheetStatus';

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
  blocked?: boolean;
  privacyBlocked?: boolean;
  timeSheetOwnerUserId?: string;
  timeSheetApproverUserId?: string;
  searchName?: string;
  // Invoicing fields (from Resource Card)
  directUnitCost?: number;
  indirectCostPercent?: number;
  unitCost?: number; // Internal cost per hour
  unitPrice?: number; // Customer billing rate per hour
  // Billable target (Timmie BC Extension with billable targets; undefined on older versions)
  billableTargetPercent?: number; // 0-100, only meaningful when billableTargetSet
  billableTargetSet?: boolean; // false = use the company default (thymeSetup)
  // Weekly capacity (Timmie BC Extension 1.19+; undefined on older versions)
  weeklyCapacityHours?: number; // only meaningful when weeklyCapacitySet; 0 = listed, not counted
  weeklyCapacitySet?: boolean; // false = hours per day x 5
  flexibleWorkingDays?: boolean; // works the weekly capacity on any days
  // Whether the signed-in user may ask the agent for suggestions for this resource (Timmie BC
  // Extension 1.18+; undefined on older versions)
  canRequestSuggestions?: boolean;
  // The person's GitHub login, '' when not set (Timmie BC Extension 1.21+; undefined on older
  // versions), and whether the signed-in user may change it (an admin, or it's their own)
  githubUsername?: string;
  canEditConnectedAccounts?: boolean;
  // Whether the signed-in user may change plans (planning lines and day notes); undefined on
  // extensions that predate day notes, which counts as no
  canEditPlan?: boolean;
  '@odata.etag'?: string;
}

/** Timmie company-wide settings (single record, Timmie BC Extension `thymeSetup` API) */
export interface BCTimmieSetup {
  id: string;
  defaultBillableTargetPercent: number; // 0-100, used for anyone without their own target
  '@odata.etag'?: string;
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
  // Sell-to customer: who the work is for (the end client when it comes through a partner).
  // Requires Timmie BC Extension 1.27.0.1+ (undefined on older versions); see getProjectCustomer
  sellToCustomerNo?: string;
  sellToCustomerName?: string;
  // Bill-to customer: who pays (the partner, for partner work); decides whether time is billable
  billToCustomerNo?: string;
  billToCustomerName?: string;
  status?: 'Open' | 'Completed' | 'Planning';
  blocked?: ' ' | 'Posting' | 'All';
  startingDate?: string;
  endingDate?: string;
  // Currency of the project's prices; blank = the company's local currency (LCY).
  // Requires Timmie BC Extension 1.14.0.0+ (undefined on older versions)
  currencyCode?: string;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
  // Set by bcClient, not BC: the bill-to customer is the company itself (named after it)
  billToIsCompany?: boolean;
  // Whether the signed-in user may change plans (planning lines and day notes); undefined on
  // extensions that predate day notes, which counts as no
  canEditPlan?: boolean;
}

/** A new project to create in BC (see bcClient.createProject) */
export interface BCProjectInput {
  displayName: string;
  /** Bill-to customer number; leave out for an internal project */
  billToCustomerNo?: string;
  /** YYYY-MM-DD */
  startingDate?: string;
  /** YYYY-MM-DD */
  endingDate?: string;
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

/**
 * A person whose timesheet can be viewed. Sourced from BC resources rather than
 * employees, because timesheets are keyed on the resource - a company can have
 * resources set up for time tracking and no employee records at all.
 */
export interface Teammate {
  id: string;
  resourceNo: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  email?: string;
  isCurrentUser?: boolean;
}

export interface BCJobTask {
  id: string;
  jobNo: string;
  jobTaskNo: string;
  description: string;
  jobTaskType: 'Posting' | 'Heading' | 'Total' | 'Begin-Total' | 'End-Total';
}

// Job Planning Line - budget/planned hours from BC Job Planning Lines table
export interface BCJobPlanningLine {
  id: string;
  jobNo: string;
  jobTaskNo: string;
  lineNo: number;
  planningDate: string;
  // BC's OData JSON serializer URL-encodes spaces in named enum values, so
  // "Both Budget and Billable" can also arrive as the `_x0020_` form. Both
  // shapes are valid at runtime; helpers like `isBudgetPlanningLine` accept
  // either. Keep the union honest so narrowing comparisons can't miss it.
  lineType:
    | 'Budget'
    | 'Billable'
    | 'Both Budget and Billable'
    | 'Both_x0020_Budget_x0020_and_x0020_Billable';
  type: 'Resource' | 'Item' | 'G/L Account';
  number: string; // The "No." field - resource/item/GL account number
  description: string;
  quantity: number;
  unitOfMeasureCode?: string; // e.g., "HOUR", "DAY" - requires Timmie BC Extension v1.7.0+
  // Costs and prices in the project currency (currencyCode; blank = LCY)
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
  // The same in the company's local currency, and the line's currency -
  // requires Timmie BC Extension 1.14.0.0+ (undefined on older versions)
  currencyCode?: string;
  unitCostLCY?: number;
  totalCostLCY?: number;
  unitPriceLCY?: number;
  totalPriceLCY?: number;
  lastModifiedDateTime: string;
  '@odata.etag'?: string;
}

// Resource Unit of Measure - conversion factors for time units
export interface BCResourceUnitOfMeasure {
  id: string;
  resourceNo: string;
  code: string; // e.g., "HOUR", "DAY"
  qtyPerUnitOfMeasure: number; // Conversion factor (e.g., DAY = 8 HOURS)
  relatedToBaseUnitOfMeasure: boolean;
  lastModifiedDateTime: string;
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

// Time Entry - from Job Ledger Entry via Timmie BC Extension
// Represents posted time entries with actual cost and invoiced price
export interface BCTimeEntry {
  id: string;
  jobNo: string;
  jobTaskNo: string;
  resourceNo: string;
  quantity: number; // Hours posted
  totalCost: number; // Internal: actual cost (quantity × unitCost), in LCY
  totalPrice: number; // Customer: invoiced price (quantity × unitPrice), in LCY
  // Project currency (blank = LCY) and the price in it -
  // requires Timmie BC Extension 1.14.0.0+ (undefined on older versions)
  currencyCode?: string;
  totalPriceProjectCurrency?: number;
  postingDate: string;
  description?: string;
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

// BC Timesheet types (from Timmie BC Extension)
export interface BCTimeSheet {
  id: string;
  number: string;
  resourceNo: string;
  resourceName?: string;
  resourceEmail?: string; // BC resource email (may differ from Azure AD UPN)
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
  timeSheetStartingDate?: string; // ISO date of the parent timesheet's start
  chargeable?: boolean; // BC defaults this to true, even on internal projects
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
}

// Time Sheet Detail - individual date/quantity records
export interface BCTimeSheetDetail {
  id: string;
  timeSheetNo: string;
  timeSheetLineNo: number;
  date: string; // ISO date format YYYY-MM-DD
  quantity: number;
  postedQuantity?: number; // Hours already posted to the Job Ledger
  status?: 'Open' | 'Submitted' | 'Rejected' | 'Approved';
  jobNo?: string;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
}

// Time Suggestion - a time entry the AI agent proposes from calendars,
// GitHub and Azure DevOps activity. Requires the Timmie BC Extension timeSuggestions API.
export type TimeSuggestionSource = 'Calendar' | 'GitHub' | 'DevOps' | 'Other';
export type TimeSuggestionConfidence = 'High' | 'Medium' | 'Low';
export type TimeSuggestionStatus = 'Pending' | 'Accepted' | 'Dismissed';

export interface BCTimeSuggestion {
  id: string;
  entryNo: number;
  resourceNo: string;
  date: string; // ISO date format YYYY-MM-DD
  quantity: number; // hours
  jobNo: string; // empty when the agent couldn't work out the project
  jobTaskNo: string;
  description: string;
  source: TimeSuggestionSource;
  sourceRef?: string;
  sourceUrl?: string;
  evidence?: string; // short reasoning, e.g. "attended 11:31–12:02"
  confidence: TimeSuggestionConfidence;
  status: TimeSuggestionStatus;
  timeSheetNo?: string;
  timeSheetLineNo?: number;
  createdBy?: string;
  createdAt?: string;
  actionedAt?: string;
  '@odata.etag'?: string;
}

// Fields Timmie writes back when a suggestion is accepted, dismissed or restored
export interface BCTimeSuggestionUpdate {
  status: TimeSuggestionStatus;
  timeSheetNo?: string;
  timeSheetLineNo?: number;
  actionedAt?: string;
}

// A request for the agent to generate time suggestions for a resource's week now (Timmie BC
// Extension 1.18+ suggestionRequests API). the agent claims it within a minute, updates
// `progress` as it checks each source, then marks it Done or Failed.
export type SuggestionRequestStatus = 'Requested' | 'Running' | 'Done' | 'Failed';

export interface BCSuggestionRequest {
  id: string;
  entryNo: number;
  resourceNo: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  status: SuggestionRequestStatus;
  progress: string; // what the agent is doing now; a summary once Done
  createdCount: number;
  updatedCount: number;
  errorMessage: string;
  requestedBy?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  lastModifiedDateTime?: string;
}

// A project's linked source (Timmie BC Extension 1.20+ projectSourceLinks API): work in this
// GitHub repo / DevOps project or repo, or a meeting with this keyword / attendee domain, is
// time on the project. The agent uses them to map its time suggestions.
export type ProjectSourceLinkType =
  | 'GitHubRepo'
  | 'DevOpsProject'
  | 'DevOpsRepo'
  | 'MeetingKeyword'
  | 'AttendeeDomain';

/**
 * One of a project's Notes in Business Central (the Notes factbox on the Project card),
 * from the Timmie extension's projectNotes API (1.25+). The latest is the project's status.
 */
export interface BCProjectNote {
  /** The note's Record Link ID */
  id: number;
  jobNo: string;
  note: string;
  createdAt: string;
  /** BC user name of who wrote it, and their full name */
  createdBy: string;
  createdByName: string;
}

export interface BCProjectSourceLink {
  id: string;
  jobNo: string;
  lineNo: number;
  type: ProjectSourceLinkType;
  value: string; // normalised by BC: owner/repo, org/project, org/project/repo, keyword, domain
  jobTaskNo: string; // '' = the agent picks the task
  useMonthlyBlock: boolean;
  learned: boolean; // added by the agent from approved time
  createdBy?: string;
  createdAt?: string;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
}

export interface BCProjectSourceLinkInput {
  jobNo: string;
  type: ProjectSourceLinkType;
  value: string;
  jobTaskNo: string;
  useMonthlyBlock: boolean;
}

// A note on a day of the Plan, e.g. "Company Off-Site" (Timmie BC Extension `dayNotes` API).
// resourceNo '' = the whole company; noProjectWork = the day isn't available for project work.
export interface BCDayNote {
  id: string;
  entryNo: number;
  noteDate: string; // YYYY-MM-DD
  resourceNo: string;
  note: string; // up to DAY_NOTE_MAX_LENGTH characters
  noProjectWork: boolean;
  createdBy?: string;
  createdAt?: string;
  lastModifiedDateTime?: string;
  '@odata.etag'?: string;
}

export interface BCDayNoteInput {
  noteDate: string;
  resourceNo: string;
  note: string;
  noProjectWork: boolean;
}

// When the AI agent was last seen (Timmie BC Extension 1.18+ agentHeartbeats API).
// lastSeenAt is stamped by BC on every poll the agent makes.
export interface BCAgentHeartbeat {
  id: string;
  agentName: string;
  lastSeenAt: string; // ISO date-time
  status?: string; // e.g. "Idle", "Working on 1 request", "Paused"
  version?: string;
}

// The agent's timesheet reviews - requires the Timmie BC Extension review tables.
// The AI agent reviews submitted timesheets and writes one review per version.
export type TimesheetReviewVerdict = 'Approve' | 'Check' | 'Query';
export type TimesheetReviewSeverity = 'Info' | 'Warning' | 'Issue';

export interface BCTimesheetReview {
  id: string;
  entryNo: number;
  timeSheetNo: string;
  // Latest lastModifiedDateTime across the timesheet's lines and details when reviewed
  versionStamp: string;
  verdict: TimesheetReviewVerdict;
  summary: string;
  reviewer: string;
  reviewedAt: string;
  lastModifiedDateTime?: string;
}

export interface BCTimesheetReviewLine {
  id: string;
  reviewEntryNo: number;
  lineNo: number;
  timeSheetNo: string;
  timeSheetLineNo: number; // 0 = the whole timesheet
  severity: TimesheetReviewSeverity;
  note: string;
}

export type TimesheetReviewRequestStatus = 'Requested' | 'Running' | 'Done' | 'Failed';

/** Someone asking the agent to (re-)review a timesheet now (timesheetReviewRequests API) */
export interface BCTimesheetReviewRequest {
  id: string;
  entryNo: number;
  timeSheetNo: string;
  status: TimesheetReviewRequestStatus;
  progress: string;
  errorMessage: string;
  requestedBy?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

// The agent's plan reviews (Timmie BC Extension planReviews, planReviewLines, planReviewChanges and
// planReviewRequests APIs). the agent reviews the Plan one subject-week at a time - a person's
// week (Resource) or a project's week (Project) - and stamps each review with the planHash of
// the plan it saw, so Timmie can tell when it's out of date.
export type PlanReviewSubjectType = 'Resource' | 'Project';

export type PlanReviewCheck =
  | 'ROUNDING'
  | 'OVER_CAPACITY'
  | 'BILLABLE_TARGET'
  | 'CALENDAR'
  | 'BUDGET_BURN'
  | 'PLAN_SHAPE'
  | 'OUTSIDE_PROJECT_DATES'
  | 'OTHER';

export interface BCPlanReview {
  id: string;
  entryNo: number;
  subjectType: PlanReviewSubjectType;
  subjectNo: string; // Resource No. or Job No.
  weekStart: string; // YYYY-MM-DD, a Monday
  // Lowercase hex SHA-256 of the canonical plan (see utils/planReview); 'PENDING' while written
  planHash: string;
  verdict: TimesheetReviewVerdict;
  summary: string;
  reviewer: string;
  reviewedAt: string;
}

/** A finding in a plan review */
export interface BCPlanReviewLine {
  id: string; // SystemId: the applyChanges action is bound to it
  reviewEntryNo: number;
  lineNo: number;
  severity: TimesheetReviewSeverity;
  check: PlanReviewCheck | string;
  planningDate: string; // YYYY-MM-DD, '' = the whole week
  jobNo: string;
  resourceNo: string;
  note: string;
  // When (and by whom) the finding's changes were applied; '' until then
  appliedAt: string;
  appliedBy: string;
}

/** A proposed change to one planning-line cell; a finding's changes are applied together */
export interface BCPlanReviewChange {
  reviewEntryNo: number;
  reviewLineNo: number;
  changeNo: number;
  jobNo: string;
  jobTaskNo: string;
  resourceNo: string;
  planningDate: string; // YYYY-MM-DD
  currentHours: number; // the cell's hours when the agent looked
  proposedHours: number; // quarter hours; 0 = remove the cell's planning line(s)
}

export type PlanReviewRequestStatus = 'Requested' | 'Running' | 'Done' | 'Failed';

/** Someone asking the agent to (re-)review a subject-week now */
export interface BCPlanReviewRequest {
  id: string;
  entryNo: number;
  subjectType: PlanReviewSubjectType;
  subjectNo: string;
  weekStart: string; // YYYY-MM-DD
  status: PlanReviewRequestStatus;
  progress: string;
  errorMessage: string;
  requestedBy?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
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
  /** The BC customer number: the key. customerName is for display only. */
  customerNo?: string;
  customerName?: string;
  isInternal?: boolean; // No bill-to customer, an "Internal" one, or the company itself: its time is never billable
  color: string;
  status: 'active' | 'completed' | 'archived';
  isFavorite: boolean;
  tasks: Task[];
  // Dates from BC Job
  startDate?: string; // ISO date string or undefined
  endDate?: string; // ISO date string or undefined
  // BC Job Currency Code: the currency of the project's prices. Blank, or undefined with
  // Timmie BC Extension before 1.14.0.0, means the company currency
  currencyCode?: string;
  // Analytics data (loaded separately), worked out as on the project page
  totalHours?: number; // Time Spent: all timesheet hours
  timeByStage?: StageHours; // totalHours split by timesheet stage
  estimateHours?: number; // Quoted on Billable Resource lines: the budget it's tracked against
  plannedHours?: number; // On Budget Resource lines (the Plan); shown for internal projects
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
  bcTimeSheetLineNo?: number;
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
  requireTimesheetComments: boolean;
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
