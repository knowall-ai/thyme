import { addDays, format, startOfWeek } from 'date-fns';
import type {
  BCAgentHeartbeat,
  BCCompany,
  BCCustomer,
  BCDayNote,
  BCEmployee,
  BCJobPlanningLine,
  BCJobTask,
  BCPlanReview,
  BCPlanReviewChange,
  BCPlanReviewLine,
  BCPlanReviewRequest,
  BCProject,
  BCProjectNote,
  BCProjectSourceLink,
  BCResource,
  BCResourceUnitOfMeasure,
  BCSuggestionRequest,
  BCTimeEntry,
  BCTimeSheet,
  BCTimeSheetDetail,
  BCTimeSheetLine,
  BCTimeSuggestion,
  BCTimesheetReview,
  BCTimesheetReviewLine,
  BCTimesheetReviewRequest,
  BCTimmieSetup,
} from '@/types';
import { DEMO_COMPANY_ID, DEMO_COMPANY_NAME, DEMO_USER } from './demoMode';

/**
 * The demo's sample data: Contoso Ltd, a small fictional consultancy, with six people,
 * four fictional customers and their projects. Every name and amount here is invented.
 *
 * Dates are worked out from "today", so the demo never looks stale: twelve weeks of
 * timesheets up to this week (older weeks approved and posted, last week waiting for
 * approval), a plan from four weeks back to three weeks ahead, and Poppie's suggestions
 * and reviews for this week.
 */

/** Bump when the shape of DemoData changes, so a tab's saved demo is regenerated */
export const DEMO_DATA_VERSION = 1;

export interface DemoCompanyInformation {
  id: string;
  displayName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  website: string;
  currencyCode: string;
}

/** A project as the Timmie extension's projects API returns it */
export type DemoProject = BCProject & { canEditSourceLinks?: boolean };

/** Every entity set the demo answers, keyed by its API name */
export interface DemoTables {
  customers: BCCustomer[];
  employees: BCEmployee[];
  resources: BCResource[];
  resourceUnitsOfMeasure: BCResourceUnitOfMeasure[];
  thymeSetup: BCTimmieSetup[];
  projects: DemoProject[];
  jobTasks: BCJobTask[];
  jobPlanningLines: BCJobPlanningLine[];
  timeEntries: BCTimeEntry[];
  timeSheets: BCTimeSheet[];
  timeSheetLines: BCTimeSheetLine[];
  timeSheetDetails: BCTimeSheetDetail[];
  timeSuggestions: BCTimeSuggestion[];
  suggestionRequests: BCSuggestionRequest[];
  agentHeartbeats: BCAgentHeartbeat[];
  projectSourceLinks: BCProjectSourceLink[];
  projectNotes: BCProjectNote[];
  dayNotes: BCDayNote[];
  timesheetReviews: BCTimesheetReview[];
  timesheetReviewLines: BCTimesheetReviewLine[];
  timesheetReviewRequests: BCTimesheetReviewRequest[];
  planReviews: BCPlanReview[];
  planReviewLines: BCPlanReviewLine[];
  planReviewChanges: BCPlanReviewChange[];
  planReviewRequests: BCPlanReviewRequest[];
}

export interface DemoData {
  version: number;
  /** The day (YYYY-MM-DD) the dates were worked out from */
  generatedOn: string;
  /** Last number handed out for ids, ETags and entry numbers */
  seq: number;
  company: BCCompany;
  companyInformation: DemoCompanyInformation;
  tables: DemoTables;
}

// ============================================
// Ids
// ============================================

/** A SystemId-shaped GUID for the n'th demo record (never one BC issues) */
export function demoGuid(n: number): string {
  return `de000000-0000-4000-9000-${n.toString(16).padStart(12, '0')}`;
}

export function demoEtag(n: number): string {
  return `W/"JzE5O2RlbW8tJHtufTsn${n}"`;
}

// ============================================
// The cast
// ============================================

interface DemoPerson {
  no: string;
  name: string;
  givenName: string;
  surname: string;
  userId: string;
  jobTitle: string;
  unitCost: number;
  unitPrice: number;
  billableTarget?: number;
  weeklyCapacity?: number;
  flexibleWorkingDays?: boolean;
  githubUsername: string;
  /** Weekdays worked, 0 = Monday */
  workdays: number[];
}

const FULL_WEEK = [0, 1, 2, 3, 4];

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    no: 'R0010',
    name: DEMO_USER.name,
    givenName: 'Alex',
    surname: 'Morgan',
    userId: 'ALEX.MORGAN',
    jobTitle: 'Delivery Lead',
    unitCost: 58,
    unitPrice: 130,
    billableTarget: 60,
    githubUsername: 'alexmorgan-demo',
    workdays: FULL_WEEK,
  },
  {
    no: 'R0020',
    name: 'Jamie Rivera',
    givenName: 'Jamie',
    surname: 'Rivera',
    userId: 'JAMIE.RIVERA',
    jobTitle: 'Senior Consultant',
    unitCost: 52,
    unitPrice: 120,
    billableTarget: 80,
    githubUsername: '',
    workdays: FULL_WEEK,
  },
  {
    no: 'R0030',
    name: 'Priya Shah',
    givenName: 'Priya',
    surname: 'Shah',
    userId: 'PRIYA.SHAH',
    jobTitle: 'Developer',
    unitCost: 47,
    unitPrice: 105,
    billableTarget: 75,
    githubUsername: 'priyashah-demo',
    workdays: FULL_WEEK,
  },
  {
    no: 'R0040',
    name: 'Sam Okafor',
    givenName: 'Sam',
    surname: 'Okafor',
    userId: 'SAM.OKAFOR',
    jobTitle: 'Support Consultant',
    unitCost: 41,
    unitPrice: 95,
    billableTarget: 70,
    weeklyCapacity: 24,
    flexibleWorkingDays: true,
    githubUsername: '',
    workdays: [0, 1, 2],
  },
  {
    no: 'R0050',
    name: 'Taylor Chen',
    givenName: 'Taylor',
    surname: 'Chen',
    userId: 'TAYLOR.CHEN',
    jobTitle: 'UX Designer',
    unitCost: 45,
    unitPrice: 100,
    // No target of their own: the company default applies
    githubUsername: '',
    workdays: FULL_WEEK,
  },
  {
    no: 'R0060',
    name: 'Morgan Blake',
    givenName: 'Morgan',
    surname: 'Blake',
    userId: 'MORGAN.BLAKE',
    jobTitle: 'Developer',
    unitCost: 44,
    unitPrice: 100,
    billableTarget: 75,
    githubUsername: 'morganblake-demo',
    workdays: FULL_WEEK,
  },
];

/** The demo user's resource */
export const DEMO_USER_RESOURCE_NO = 'R0010';

const HOURS_PER_DAY = 8;
const DEFAULT_BILLABLE_TARGET = 70;

const CUSTOMERS: Array<Pick<BCCustomer, 'number' | 'displayName' | 'email' | 'phoneNumber'>> = [
  { number: 'C10000', displayName: 'Fabrikam, Inc.', email: 'accounts@fabrikam.example' },
  { number: 'C20000', displayName: 'Northwind Traders', email: 'finance@northwind.example' },
  { number: 'C30000', displayName: 'Adventure Works Cycles', email: 'ap@adventure-works.example' },
  { number: 'C40000', displayName: 'Tailspin Toys', email: 'billing@tailspintoys.example' },
];

interface DemoTask {
  no: string;
  description: string;
  /** The least the task's estimate (Billable line) quotes, e.g. for work still to start */
  estimate?: number;
  notes: string[];
}

interface DemoProjectSpec {
  no: string;
  name: string;
  customerNo?: string;
  status: 'Open' | 'Completed' | 'Planning';
  /** Weeks from this week */
  startWeek: number;
  endWeek: number;
  /** Who the estimate is quoted against */
  lead: string;
  /**
   * The estimate as a share of the hours spent plus those still planned, task by task:
   * above 1 is on budget, below 1 over it. None: no estimate (internal, not started).
   */
  budgetFactor?: number;
  tasks: DemoTask[];
}

const INTERNAL_PROJECT = 'J00090';

const PROJECTS: readonly DemoProjectSpec[] = [
  {
    no: 'J00010',
    name: 'ERP Rollout Phase 2',
    customerNo: 'C10000',
    status: 'Open',
    startWeek: -16,
    endWeek: 10,
    lead: 'R0020',
    budgetFactor: 1.1,
    tasks: [
      {
        no: '100',
        description: 'Discovery & Design',
        notes: ['Process workshops with the finance team', 'Solution design document'],
      },
      {
        no: '200',
        description: 'Configuration',
        notes: ['Configured posting groups and dimensions', 'Approval workflows set up'],
      },
      {
        no: '300',
        description: 'Data Migration',
        notes: ['Customer and vendor data mapping', 'Trial migration of open orders'],
      },
      {
        no: '400',
        description: 'Training & Go-Live',
        estimate: 60,
        notes: ['Key user training'],
      },
    ],
  },
  {
    no: 'J00020',
    name: 'Warehouse Mobile App',
    customerNo: 'C20000',
    status: 'Open',
    startWeek: -13,
    endWeek: 7,
    lead: 'R0030',
    budgetFactor: 1.2,
    tasks: [
      {
        no: '100',
        description: 'UX Design',
        notes: ['Picking screen prototypes', 'Usability test with warehouse staff'],
      },
      {
        no: '200',
        description: 'Build',
        notes: ['Barcode scanning flow', 'Offline sync for stock counts', 'Code review'],
      },
      {
        no: '300',
        description: 'Testing',
        estimate: 40,
        notes: ['Regression test run', 'Fixed defects from UAT'],
      },
    ],
  },
  {
    no: 'J00030',
    name: 'Dealer Portal',
    customerNo: 'C30000',
    status: 'Open',
    startWeek: -14,
    endWeek: 2,
    lead: 'R0060',
    budgetFactor: 0.9,
    tasks: [
      {
        no: '100',
        description: 'Build',
        notes: ['Dealer order history pages', 'Single sign-on for dealers', 'Pricing API'],
      },
      {
        no: '200',
        description: 'Hypercare',
        estimate: 20,
        notes: ['Post-launch fixes'],
      },
    ],
  },
  {
    no: 'J00040',
    name: 'Support Retainer',
    customerNo: 'C40000',
    status: 'Open',
    startWeek: -30,
    endWeek: 22,
    lead: 'R0040',
    budgetFactor: 1.4,
    tasks: [
      {
        no: '100',
        description: 'Support Desk',
        notes: ['Support tickets', 'User access requests', 'Month-end support'],
      },
      {
        no: '200',
        description: 'Minor Enhancements',
        notes: ['Report layout changes', 'New field on the sales order'],
      },
    ],
  },
  {
    no: 'J00050',
    name: 'Sales Dashboards',
    customerNo: 'C10000',
    status: 'Completed',
    startWeek: -20,
    endWeek: -9,
    lead: 'R0050',
    budgetFactor: 1.05,
    tasks: [
      {
        no: '100',
        description: 'Dashboards',
        notes: ['Pipeline dashboard', 'Regional sales report'],
      },
    ],
  },
  {
    no: 'J00060',
    name: 'Customer Onboarding Portal',
    customerNo: 'C20000',
    status: 'Planning',
    startWeek: 3,
    endWeek: 16,
    lead: 'R0050',
    tasks: [{ no: '100', description: 'Discovery', notes: ['Kick-off'] }],
  },
  {
    no: INTERNAL_PROJECT,
    name: 'Contoso Internal',
    status: 'Open',
    startWeek: -52,
    endWeek: 52,
    lead: 'R0010',
    tasks: [
      {
        no: '100',
        description: 'Admin & Meetings',
        notes: ['Team meeting', 'Weekly planning', '1:1s'],
      },
      { no: '200', description: 'Training', notes: ['Certification study'] },
      { no: '300', description: 'Absence - Holiday', notes: ['Holiday'] },
      { no: '400', description: 'Absence - Sickness', notes: ['Sick'] },
    ],
  },
];

/** What each person works on: share of their day per project task, for some weeks */
interface WorkShare {
  jobNo: string;
  taskNo: string | ((week: number) => string);
  share: number;
  /** Weeks from this week, inclusive; every week when left out */
  weeks?: [number, number];
}

const erpTask = (week: number) => (week < -8 ? '100' : week < -2 ? '200' : '300');
const warehouseTask = (week: number) => (week < -8 ? '100' : week < 0 ? '200' : '300');

const WORK: Record<string, WorkShare[]> = {
  R0010: [
    { jobNo: 'J00010', taskNo: erpTask, share: 0.45 },
    { jobNo: 'J00040', taskNo: '100', share: 0.15 },
    { jobNo: INTERNAL_PROJECT, taskNo: '100', share: 0.4 },
  ],
  R0020: [
    { jobNo: 'J00010', taskNo: erpTask, share: 0.65 },
    { jobNo: 'J00030', taskNo: '100', share: 0.25 },
    { jobNo: INTERNAL_PROJECT, taskNo: '100', share: 0.1 },
  ],
  R0030: [
    { jobNo: 'J00050', taskNo: '100', share: 0.4, weeks: [-16, -9] },
    { jobNo: 'J00010', taskNo: erpTask, share: 0.3 },
    { jobNo: 'J00020', taskNo: warehouseTask, share: 0.55 },
    { jobNo: INTERNAL_PROJECT, taskNo: '200', share: 0.15 },
  ],
  R0040: [
    { jobNo: 'J00040', taskNo: '100', share: 0.6 },
    { jobNo: 'J00040', taskNo: '200', share: 0.25 },
    { jobNo: INTERNAL_PROJECT, taskNo: '100', share: 0.15 },
  ],
  R0050: [
    { jobNo: 'J00050', taskNo: '100', share: 0.5, weeks: [-16, -9] },
    { jobNo: 'J00020', taskNo: '100', share: 0.45 },
    { jobNo: 'J00030', taskNo: '100', share: 0.3 },
    { jobNo: INTERNAL_PROJECT, taskNo: '100', share: 0.25 },
  ],
  R0060: [
    { jobNo: 'J00030', taskNo: (week) => (week < 0 ? '100' : '200'), share: 0.6 },
    { jobNo: 'J00020', taskNo: '200', share: 0.3 },
    { jobNo: INTERNAL_PROJECT, taskNo: '100', share: 0.1 },
  ],
};

const HISTORY_WEEKS = 16;
const PLAN_WEEKS_BACK = 4;
const PLAN_WEEKS_AHEAD = 3;

// ============================================
// Helpers
// ============================================

/** A small seeded random number generator, so the demo looks the same every time */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const roundHalf = (hours: number) => Math.round(hours * 2) / 2;
const ymd = (date: Date) => format(date, 'yyyy-MM-dd');

function taskFor(share: WorkShare, week: number): string {
  return typeof share.taskNo === 'function' ? share.taskNo(week) : share.taskNo;
}

function inWeeks(share: WorkShare, week: number): boolean {
  return !share.weeks || (week >= share.weeks[0] && week <= share.weeks[1]);
}

/** The shares that apply in a week, scaled to add up to 1 */
function sharesForWeek(resourceNo: string, week: number, billableOnly = false): WorkShare[] {
  const shares = (WORK[resourceNo] ?? []).filter((share) => {
    const project = PROJECTS.find((p) => p.no === share.jobNo);
    const running = !!project && week >= project.startWeek && week <= project.endWeek;
    return running && inWeeks(share, week) && (!billableOnly || share.jobNo !== INTERNAL_PROJECT);
  });
  const total = shares.reduce((sum, share) => sum + share.share, 0) || 1;
  return shares.map((share) => ({ ...share, share: share.share / total }));
}

/** Split a day's hours across shares in half hours, the last share taking what's left */
function splitDay(hours: number, shares: WorkShare[], random: () => number, step = 0.5): number[] {
  const round = (h: number) => Math.round(h / step) * step;
  const split: number[] = [];
  let left = hours;
  shares.forEach((share, index) => {
    if (index === shares.length - 1) {
      split.push(Math.max(0, round(left)));
      return;
    }
    const wobble = 0.75 + random() * 0.5;
    const value = Math.min(left, Math.max(0, round(hours * share.share * wobble)));
    split.push(value);
    left -= value;
  });
  return split;
}

// ============================================
// The data
// ============================================

/** Build the demo's sample data for a day (normally today) */
export function createDemoData(today: Date = new Date()): DemoData {
  let seq = 0;
  const next = () => ++seq;
  const now = today.getTime();
  const todayStr = ymd(today);
  const thisWeek = startOfWeek(today, { weekStartsOn: 1 });
  const weekStart = (week: number) => addDays(thisWeek, week * 7);
  const dayOf = (week: number, weekday: number) => addDays(weekStart(week), weekday);
  const isoAgo = (ms: number) => new Date(now - ms).toISOString();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  // When a past week's records were last changed: its Friday at 17:30
  const weekStamp = (week: number) => {
    const friday = dayOf(week, 4);
    friday.setHours(17, 30, 0, 0);
    return friday.getTime() > now ? isoAgo(2 * HOUR) : friday.toISOString();
  };

  const people = new Map(DEMO_PEOPLE.map((person) => [person.no, person]));
  const projectSpecs = new Map(PROJECTS.map((project) => [project.no, project]));
  const customerName = (no?: string) => CUSTOMERS.find((c) => c.number === no)?.displayName ?? '';

  // --- Company, customers, people ---
  const company: BCCompany = {
    id: DEMO_COMPANY_ID,
    name: DEMO_COMPANY_NAME,
    displayName: DEMO_COMPANY_NAME,
    businessProfileId: '',
  };
  const companyInformation: DemoCompanyInformation = {
    id: demoGuid(next()),
    displayName: DEMO_COMPANY_NAME,
    addressLine1: '1 Sample Street',
    addressLine2: 'Demo Park',
    city: 'Reading',
    postalCode: 'RG1 0AA',
    country: 'GB',
    email: 'hello@contoso.com',
    website: 'www.contoso.com',
    currencyCode: 'GBP',
  };

  const customers: BCCustomer[] = CUSTOMERS.map((customer) => ({
    id: demoGuid(next()),
    ...customer,
    lastModifiedDateTime: isoAgo(90 * DAY),
  }));

  const employees: BCEmployee[] = DEMO_PEOPLE.map((person, index) => ({
    id: demoGuid(next()),
    number: `E${String(index + 1).padStart(3, '0')}`,
    displayName: person.name,
    givenName: person.givenName,
    surname: person.surname,
    jobTitle: person.jobTitle,
    email: `${person.userId.toLowerCase()}@contoso.com`,
    status: 'Active',
    lastModifiedDateTime: isoAgo(60 * DAY),
  }));

  const resources: BCResource[] = DEMO_PEOPLE.map((person) => {
    const n = next();
    return {
      id: demoGuid(n),
      number: person.no,
      name: person.name,
      displayName: person.name,
      type: 'Person',
      baseUnitOfMeasure: 'HOUR',
      useTimeSheet: true,
      blocked: false,
      privacyBlocked: false,
      timeSheetOwnerUserId: person.userId,
      timeSheetApproverUserId: person.no === DEMO_USER_RESOURCE_NO ? 'JAMIE.RIVERA' : 'ALEX.MORGAN',
      searchName: person.name.toUpperCase(),
      directUnitCost: person.unitCost,
      indirectCostPercent: 0,
      unitCost: person.unitCost,
      unitPrice: person.unitPrice,
      billableTargetPercent: person.billableTarget ?? 0,
      billableTargetSet: person.billableTarget !== undefined,
      weeklyCapacityHours: person.weeklyCapacity ?? 0,
      weeklyCapacitySet: person.weeklyCapacity !== undefined,
      flexibleWorkingDays: person.flexibleWorkingDays ?? false,
      canRequestSuggestions: true,
      githubUsername: person.githubUsername,
      canEditConnectedAccounts: true,
      canEditPlan: true,
      '@odata.etag': demoEtag(n),
    };
  });

  const resourceUnitsOfMeasure: BCResourceUnitOfMeasure[] = DEMO_PEOPLE.flatMap((person) => [
    {
      id: demoGuid(next()),
      resourceNo: person.no,
      code: 'HOUR',
      qtyPerUnitOfMeasure: 1,
      relatedToBaseUnitOfMeasure: true,
      lastModifiedDateTime: isoAgo(90 * DAY),
    },
    {
      id: demoGuid(next()),
      resourceNo: person.no,
      code: 'DAY',
      qtyPerUnitOfMeasure: HOURS_PER_DAY,
      relatedToBaseUnitOfMeasure: true,
      lastModifiedDateTime: isoAgo(90 * DAY),
    },
  ]);

  const setupSeq = next();
  const thymeSetup: BCTimmieSetup[] = [
    {
      id: demoGuid(setupSeq),
      defaultBillableTargetPercent: DEFAULT_BILLABLE_TARGET,
      '@odata.etag': demoEtag(setupSeq),
    },
  ];

  // --- Projects, tasks, estimates ---
  const projects: DemoProject[] = PROJECTS.map((spec) => {
    const n = next();
    const customer = customerName(spec.customerNo);
    return {
      id: demoGuid(n),
      number: spec.no,
      displayName: spec.name,
      sellToCustomerNo: spec.customerNo ?? '',
      sellToCustomerName: customer,
      billToCustomerNo: spec.customerNo ?? '',
      billToCustomerName: customer,
      status: spec.status,
      blocked: ' ',
      startingDate: ymd(weekStart(spec.startWeek)),
      endingDate: ymd(dayOf(spec.endWeek, 4)),
      currencyCode: '',
      lastModifiedDateTime: isoAgo(7 * DAY),
      canEditPlan: true,
      canEditSourceLinks: true,
      '@odata.etag': demoEtag(n),
    };
  });

  const jobTasks: BCJobTask[] = PROJECTS.flatMap((spec) =>
    spec.tasks.map((task) => ({
      id: demoGuid(next()),
      jobNo: spec.no,
      jobTaskNo: task.no,
      description: task.description,
      jobTaskType: 'Posting' as const,
    }))
  );

  const lineNos = new Map<string, number>();
  const nextLineNo = (jobNo: string) => {
    const lineNo = (lineNos.get(jobNo) ?? 0) + 10000;
    lineNos.set(jobNo, lineNo);
    return lineNo;
  };

  const planningLine = (
    spec: { jobNo: string; jobTaskNo: string; resourceNo: string; date: string; hours: number },
    lineType: BCJobPlanningLine['lineType'],
    modified: string
  ): BCJobPlanningLine => {
    const person = people.get(spec.resourceNo)!;
    const n = next();
    const totalCost = spec.hours * person.unitCost;
    const totalPrice = spec.hours * person.unitPrice;
    return {
      id: demoGuid(n),
      jobNo: spec.jobNo,
      jobTaskNo: spec.jobTaskNo,
      lineNo: nextLineNo(spec.jobNo),
      planningDate: spec.date,
      lineType,
      type: 'Resource',
      number: spec.resourceNo,
      description: person.name,
      quantity: spec.hours,
      unitOfMeasureCode: 'HOUR',
      unitCost: person.unitCost,
      unitPrice: person.unitPrice,
      totalCost,
      totalPrice,
      currencyCode: '',
      unitCostLCY: person.unitCost,
      totalCostLCY: totalCost,
      unitPriceLCY: person.unitPrice,
      totalPriceLCY: totalPrice,
      lastModifiedDateTime: modified,
      '@odata.etag': demoEtag(n),
    };
  };

  const jobPlanningLines: BCJobPlanningLine[] = [];

  // --- Day notes ---
  const offsiteDate = ymd(dayOf(1, 4));
  const dayNoteSpecs: Array<Omit<BCDayNote, 'id' | 'entryNo' | '@odata.etag'>> = [
    {
      noteDate: offsiteDate,
      resourceNo: '',
      note: 'Company off-site',
      noProjectWork: true,
      createdBy: 'ALEX.MORGAN',
      createdAt: isoAgo(5 * DAY),
    },
    {
      noteDate: ymd(dayOf(1, 0)),
      resourceNo: 'R0040',
      note: 'Half day: dentist',
      noProjectWork: false,
      createdBy: 'SAM.OKAFOR',
      createdAt: isoAgo(3 * DAY),
    },
    {
      noteDate: ymd(dayOf(0, 1)),
      resourceNo: 'R0050',
      note: 'At the Northwind office',
      noProjectWork: false,
      createdBy: 'TAYLOR.CHEN',
      createdAt: isoAgo(9 * DAY),
    },
  ];
  const dayNotes: BCDayNote[] = dayNoteSpecs.map((spec) => {
    const n = next();
    return {
      ...spec,
      id: demoGuid(n),
      entryNo: n,
      lastModifiedDateTime: spec.createdAt,
      '@odata.etag': demoEtag(n),
    };
  });

  // --- The plan (Budget lines): a full day per person, a few days off it ---
  for (let week = -PLAN_WEEKS_BACK; week <= PLAN_WEEKS_AHEAD; week++) {
    for (const person of DEMO_PEOPLE) {
      const shares = sharesForWeek(person.no, week, true);
      const random = seededRandom(`plan|${person.no}|${week}`);
      for (const weekday of person.workdays) {
        const date = ymd(dayOf(week, weekday));
        if (date === offsiteDate) continue;
        let hours = HOURS_PER_DAY;
        // Half day off, and an under-planned Friday
        if (person.no === 'R0040' && week === 1 && weekday === 0) hours = 4;
        if (person.no === 'R0050' && weekday === 4 && week >= 0) hours = 4;
        const split = splitDay(hours, shares, random, 1);
        shares.forEach((share, index) => {
          const shareHours = split[index];
          if (shareHours <= 0) return;
          const projectSpec = projectSpecs.get(share.jobNo)!;
          if (week < projectSpec.startWeek || week > projectSpec.endWeek) return;
          jobPlanningLines.push(
            planningLine(
              {
                jobNo: share.jobNo,
                jobTaskNo: taskFor(share, week),
                resourceNo: person.no,
                date,
                hours: shareHours,
              },
              'Budget',
              weekStamp(Math.min(week, 0) - 1)
            )
          );
        });
      }
    }
  }

  // Jamie is double-booked on Wednesday this week: Poppie's plan review flags it
  const overbookedDate = ymd(dayOf(0, 2));
  for (const line of jobPlanningLines) {
    if (
      line.lineType !== 'Budget' ||
      line.number !== 'R0020' ||
      line.planningDate !== overbookedDate
    )
      continue;
    line.quantity = line.jobNo === 'J00030' ? 4 : 6;
    line.totalCost = line.quantity * line.unitCost;
    line.totalPrice = line.quantity * line.unitPrice;
    line.totalCostLCY = line.totalCost;
    line.totalPriceLCY = line.totalPrice;
  }
  if (
    !jobPlanningLines.some(
      (l) => l.number === 'R0020' && l.planningDate === overbookedDate && l.jobNo === 'J00030'
    )
  ) {
    jobPlanningLines.push(
      planningLine(
        {
          jobNo: 'J00030',
          jobTaskNo: '100',
          resourceNo: 'R0020',
          date: overbookedDate,
          hours: 4,
        },
        'Budget',
        isoAgo(3 * DAY)
      )
    );
  }

  // --- Timesheets, twelve weeks up to this one ---
  const timeSheets: BCTimeSheet[] = [];
  const timeSheetLines: BCTimeSheetLine[] = [];
  const timeSheetDetails: BCTimeSheetDetail[] = [];
  const timeEntries: BCTimeEntry[] = [];
  let timesheetNo = 1000;

  // Last workday before today in this week: the demo user's gap Poppie fills
  const workdaysBeforeToday = FULL_WEEK.filter((weekday) => ymd(dayOf(0, weekday)) < todayStr);
  const alexGapDay = workdaysBeforeToday.length > 1 ? workdaysBeforeToday.at(-1) : undefined;

  type LineStatus = BCTimeSheetLine['status'];
  const statusFor = (resourceNo: string, week: number, jobNo: string): LineStatus => {
    if (week <= -2) return 'Approved';
    if (week === -1) {
      if (resourceNo === 'R0020' || resourceNo === 'R0030') return 'Submitted';
      if (resourceNo === 'R0060' && jobNo === 'J00020') return 'Rejected';
      return 'Approved';
    }
    // This week: Sam has done his three days and sent them in
    if (resourceNo === 'R0040' && workdaysBeforeToday.length > 0) return 'Submitted';
    return 'Open';
  };

  for (let week = -HISTORY_WEEKS; week <= 0; week++) {
    const start = weekStart(week);
    for (const person of DEMO_PEOPLE) {
      const sheetSeq = next();
      const sheet: BCTimeSheet = {
        id: demoGuid(sheetSeq),
        number: `TS${String(++timesheetNo).padStart(5, '0')}`,
        resourceNo: person.no,
        resourceName: person.name,
        startingDate: ymd(start),
        endingDate: ymd(addDays(start, 6)),
        approverUserId: person.no === DEMO_USER_RESOURCE_NO ? 'JAMIE.RIVERA' : 'ALEX.MORGAN',
        openExists: false,
        submittedExists: false,
        rejectedExists: false,
        approvedExists: false,
        totalQuantity: 0,
        '@odata.etag': demoEtag(sheetSeq),
      };
      timeSheets.push(sheet);

      const random = seededRandom(`time|${person.no}|${week}`);
      const shares = sharesForWeek(person.no, week);
      const modified = weekStamp(week);
      const posted = week <= -3;

      // Holidays: Sam's week off, and a long weekend for Jamie
      const holidayDays =
        person.no === 'R0040' && week === -5
          ? person.workdays
          : person.no === 'R0020' && week === -7
            ? [4]
            : [];

      const lines = new Map<string, BCTimeSheetLine>();
      let lineNo = 0;
      const lineFor = (jobNo: string, taskNo: string): BCTimeSheetLine => {
        const key = `${jobNo}|${taskNo}`;
        let line = lines.get(key);
        if (!line) {
          const n = next();
          const task = projectSpecs.get(jobNo)!.tasks.find((t) => t.no === taskNo)!;
          let description = task.notes[Math.floor(random() * task.notes.length)];
          // One entry without a comment, for Poppie's timesheet review to point out
          if (person.no === 'R0030' && week === -1 && jobNo === INTERNAL_PROJECT) description = '';
          line = {
            id: demoGuid(n),
            timeSheetNo: sheet.number,
            lineNo: (lineNo += 10000),
            type: 'Job',
            jobNo,
            jobTaskNo: taskNo,
            description,
            totalQuantity: 0,
            status: statusFor(person.no, week, jobNo),
            timeSheetStartingDate: sheet.startingDate,
            chargeable: jobNo !== INTERNAL_PROJECT,
            lastModifiedDateTime: modified,
            '@odata.etag': demoEtag(n),
          };
          lines.set(key, line);
        }
        return line;
      };

      const addDetail = (line: BCTimeSheetLine, date: string, quantity: number) => {
        const n = next();
        timeSheetDetails.push({
          id: demoGuid(n),
          timeSheetNo: line.timeSheetNo,
          timeSheetLineNo: line.lineNo,
          date,
          quantity,
          postedQuantity: posted ? quantity : 0,
          status: line.status,
          jobNo: line.jobNo,
          lastModifiedDateTime: modified,
          '@odata.etag': demoEtag(n),
        });
      };

      for (const weekday of person.workdays) {
        const dateStr = ymd(dayOf(week, weekday));
        // Nothing logged for today or later, nor for the demo user's gap day
        if (dateStr >= todayStr) continue;
        if (week === 0 && person.no === DEMO_USER_RESOURCE_NO && weekday === alexGapDay) continue;

        if (holidayDays.includes(weekday)) {
          addDetail(lineFor(INTERNAL_PROJECT, '300'), dateStr, HOURS_PER_DAY);
          continue;
        }

        let dayHours = HOURS_PER_DAY + [-0.5, 0, 0, 0, 0.5][Math.floor(random() * 5)];
        // A short Thursday on Priya's submitted week
        if (person.no === 'R0030' && week === -1 && weekday === 3) dayHours = 5.5;
        const split = splitDay(dayHours, shares, random);
        shares.forEach((share, index) => {
          if (split[index] > 0)
            addDetail(lineFor(share.jobNo, taskFor(share, week)), dateStr, split[index]);
        });
      }

      timeSheetLines.push(...lines.values());

      // Posted weeks are in the project ledger: one entry per line
      if (posted) {
        for (const line of lines.values()) {
          const hours = timeSheetDetails
            .filter((d) => d.timeSheetNo === line.timeSheetNo && d.timeSheetLineNo === line.lineNo)
            .reduce((sum, d) => sum + d.quantity, 0);
          if (hours <= 0) continue;
          const internal = line.jobNo === INTERNAL_PROJECT;
          const price = internal ? 0 : hours * person.unitPrice;
          timeEntries.push({
            id: demoGuid(next()),
            jobNo: line.jobNo!,
            jobTaskNo: line.jobTaskNo!,
            resourceNo: person.no,
            quantity: hours,
            totalCost: hours * person.unitCost,
            totalPrice: price,
            currencyCode: '',
            totalPriceProjectCurrency: price,
            postingDate: ymd(dayOf(week, 4)),
            description: line.description,
          });
        }
      }
    }
  }

  // --- Estimates (Billable lines), quoted at the start of each project ---
  const nextWeekStr = ymd(weekStart(1));
  for (const spec of PROJECTS) {
    if (spec.budgetFactor === undefined) continue;
    for (const task of spec.tasks) {
      const lines = timeSheetLines.filter((l) => l.jobNo === spec.no && l.jobTaskNo === task.no);
      const spent = timeSheetDetails
        .filter((d) =>
          lines.some((l) => l.timeSheetNo === d.timeSheetNo && l.lineNo === d.timeSheetLineNo)
        )
        .reduce((sum, d) => sum + d.quantity, 0);
      const stillPlanned = jobPlanningLines
        .filter(
          (l) => l.jobNo === spec.no && l.jobTaskNo === task.no && l.planningDate >= nextWeekStr
        )
        .reduce((sum, l) => sum + l.quantity, 0);
      const hours = Math.max(
        task.estimate ?? 0,
        Math.round(((spent + stillPlanned) * spec.budgetFactor) / 10) * 10
      );
      if (hours <= 0) continue;
      jobPlanningLines.push(
        planningLine(
          {
            jobNo: spec.no,
            jobTaskNo: task.no,
            resourceNo: spec.lead,
            date: ymd(weekStart(spec.startWeek)),
            hours,
          },
          'Billable',
          weekStamp(spec.startWeek)
        )
      );
    }
  }

  const sheetFor = (resourceNo: string, week: number) =>
    timeSheets.find((s) => s.resourceNo === resourceNo && s.startingDate === ymd(weekStart(week)))!;
  const linesOf = (sheet: BCTimeSheet) =>
    timeSheetLines.filter((l) => l.timeSheetNo === sheet.number);
  const versionStamp = (sheet: BCTimeSheet) => {
    const stamps = [
      ...linesOf(sheet).map((l) => l.lastModifiedDateTime ?? ''),
      ...timeSheetDetails
        .filter((d) => d.timeSheetNo === sheet.number)
        .map((d) => d.lastModifiedDateTime ?? ''),
    ].filter(Boolean);
    return stamps.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? isoAgo(DAY);
  };

  // --- Poppie: time suggestions for the demo user's week ---
  const suggestionDay = ymd(dayOf(0, alexGapDay ?? workdaysBeforeToday.at(-1) ?? 0));
  const alexSheet = sheetFor(DEMO_USER_RESOURCE_NO, 0);
  const suggestionSpecs: Array<
    Pick<
      BCTimeSuggestion,
      'quantity' | 'jobNo' | 'jobTaskNo' | 'description' | 'source' | 'sourceRef' | 'evidence'
    > & { confidence: BCTimeSuggestion['confidence'] }
  > = [
    {
      quantity: 1.5,
      jobNo: 'J00010',
      jobTaskNo: '300',
      description: 'Fabrikam data migration steering meeting',
      source: 'Calendar',
      sourceRef: 'Teams meeting',
      evidence: 'Attended 10:00-11:30 with 4 people from fabrikam.example',
      confidence: 'High',
    },
    {
      quantity: 3,
      jobNo: 'J00010',
      jobTaskNo: '300',
      description: 'Reviewed the trial migration results and fixed the vendor mapping',
      source: 'DevOps',
      sourceRef: 'Task 4127',
      evidence: 'Task 4127 moved to Done; 3 commits to fabrikam-erp/migration',
      confidence: 'Medium',
    },
    {
      quantity: 1,
      jobNo: 'J00040',
      jobTaskNo: '100',
      description: 'Tailspin Toys month-end support call',
      source: 'Calendar',
      sourceRef: 'Teams call',
      evidence: 'Call 14:00-15:00 with tailspintoys.example',
      confidence: 'High',
    },
    {
      quantity: 1,
      jobNo: '',
      jobTaskNo: '',
      description: 'Pull request: update the release checklist',
      source: 'GitHub',
      sourceRef: 'contoso/delivery-playbook#18',
      evidence: 'Opened and merged a pull request; no project is linked to this repo',
      confidence: 'Low',
    },
  ];
  const timeSuggestions: BCTimeSuggestion[] = suggestionSpecs.map((spec) => {
    const n = next();
    return {
      id: demoGuid(n),
      entryNo: n,
      resourceNo: DEMO_USER_RESOURCE_NO,
      date: suggestionDay,
      status: 'Pending',
      timeSheetNo: alexSheet.number,
      createdBy: 'POPPIE',
      createdAt: isoAgo(2 * HOUR),
      '@odata.etag': demoEtag(n),
      ...spec,
    };
  });

  const requestSeq = next();
  const suggestionRequests: BCSuggestionRequest[] = [
    {
      id: demoGuid(requestSeq),
      entryNo: requestSeq,
      resourceNo: DEMO_USER_RESOURCE_NO,
      fromDate: ymd(weekStart(0)),
      toDate: ymd(dayOf(0, 6)),
      status: 'Done',
      progress: 'Checked your calendar, GitHub and Azure DevOps: 4 suggestions',
      createdCount: suggestionSpecs.length,
      updatedCount: 0,
      errorMessage: '',
      requestedBy: 'ALEX.MORGAN',
      requestedAt: isoAgo(2 * HOUR + 5 * 60 * 1000),
      startedAt: isoAgo(2 * HOUR + 4 * 60 * 1000),
      finishedAt: isoAgo(2 * HOUR),
      lastModifiedDateTime: isoAgo(2 * HOUR),
    },
  ];

  const agentHeartbeats: BCAgentHeartbeat[] = [
    {
      id: demoGuid(next()),
      agentName: 'POPPIE',
      lastSeenAt: isoAgo(30 * 1000),
      status: 'Idle',
      version: 'demo',
    },
  ];

  // --- Poppie: timesheet reviews of the submitted weeks ---
  const timesheetReviews: BCTimesheetReview[] = [];
  const timesheetReviewLines: BCTimesheetReviewLine[] = [];
  const addTimesheetReview = (
    sheet: BCTimeSheet,
    verdict: BCTimesheetReview['verdict'],
    summary: string,
    notes: Array<{
      line?: BCTimeSheetLine;
      severity: BCTimesheetReviewLine['severity'];
      note: string;
    }>
  ) => {
    const n = next();
    timesheetReviews.push({
      id: demoGuid(n),
      entryNo: n,
      timeSheetNo: sheet.number,
      versionStamp: versionStamp(sheet),
      verdict,
      summary,
      reviewer: 'POPPIE',
      reviewedAt: isoAgo(DAY + 3 * HOUR),
      lastModifiedDateTime: isoAgo(DAY + 3 * HOUR),
    });
    notes.forEach((note, index) => {
      timesheetReviewLines.push({
        id: demoGuid(next()),
        reviewEntryNo: n,
        lineNo: (index + 1) * 10000,
        timeSheetNo: sheet.number,
        timeSheetLineNo: note.line?.lineNo ?? 0,
        severity: note.severity,
        note: note.note,
      });
    });
  };

  addTimesheetReview(
    sheetFor('R0020', -1),
    'Approve',
    'A full week, every entry has a comment, and the billable share is above the 80% target.',
    []
  );
  const priyaSheet = sheetFor('R0030', -1);
  addTimesheetReview(priyaSheet, 'Check', 'Thursday is short, and one entry has no comment.', [
    {
      severity: 'Warning',
      note: 'Thursday has 5.5 hours against an 8-hour day. Is any time missing?',
    },
    {
      line: linesOf(priyaSheet).find((l) => !l.description),
      severity: 'Info',
      note: 'No comment: add a line saying what the training was.',
    },
  ]);
  const samSheet = sheetFor('R0040', 0);
  const samEnhancements = linesOf(samSheet).find((l) => l.jobTaskNo === '200');
  if (samEnhancements?.status === 'Submitted') {
    addTimesheetReview(
      samSheet,
      'Query',
      "Minor Enhancements time on the Tailspin Toys retainer isn't in this month's plan.",
      [
        {
          line: samEnhancements,
          severity: 'Issue',
          note: 'Tailspin Toys asked for enhancements to be quoted first. Was this agreed?',
        },
      ]
    );
  }

  // --- Poppie: plan reviews of this week (hashes are filled in by the data source) ---
  const planReviews: BCPlanReview[] = [];
  const planReviewLines: BCPlanReviewLine[] = [];
  const planReviewChanges: BCPlanReviewChange[] = [];
  const thisWeekStr = ymd(weekStart(0));
  const addPlanReview = (
    subjectType: BCPlanReview['subjectType'],
    subjectNo: string,
    verdict: BCPlanReview['verdict'],
    summary: string,
    findings: Array<
      Pick<
        BCPlanReviewLine,
        'severity' | 'check' | 'planningDate' | 'jobNo' | 'resourceNo' | 'note'
      > & {
        changes?: Array<Omit<BCPlanReviewChange, 'reviewEntryNo' | 'reviewLineNo' | 'changeNo'>>;
      }
    >
  ) => {
    const n = next();
    planReviews.push({
      id: demoGuid(n),
      entryNo: n,
      subjectType,
      subjectNo,
      weekStart: thisWeekStr,
      planHash: '',
      verdict,
      summary,
      reviewer: 'POPPIE',
      reviewedAt: isoAgo(20 * HOUR),
    });
    findings.forEach(({ changes = [], ...finding }, index) => {
      const lineNo = (index + 1) * 10000;
      planReviewLines.push({
        id: demoGuid(next()),
        reviewEntryNo: n,
        lineNo,
        appliedAt: '',
        appliedBy: '',
        ...finding,
      });
      changes.forEach((change, changeIndex) =>
        planReviewChanges.push({
          ...change,
          reviewEntryNo: n,
          reviewLineNo: lineNo,
          changeNo: changeIndex + 1,
        })
      );
    });
  };

  addPlanReview(
    'Resource',
    'R0020',
    'Query',
    'Wednesday is over-booked: 10 hours planned against an 8-hour day.',
    [
      {
        severity: 'Issue',
        check: 'OVER_CAPACITY',
        planningDate: overbookedDate,
        jobNo: 'J00030',
        resourceNo: 'R0020',
        note: '10h planned across 2 projects. Cut Dealer Portal to 2 hours on Wednesday.',
        changes: [
          {
            jobNo: 'J00030',
            jobTaskNo: '100',
            resourceNo: 'R0020',
            planningDate: overbookedDate,
            currentHours: 4,
            proposedHours: 2,
          },
        ],
      },
    ]
  );
  addPlanReview(
    'Resource',
    'R0010',
    'Approve',
    'Planned to capacity every day, with client work above the 60% billable target.',
    []
  );
  addPlanReview(
    'Resource',
    'R0030',
    'Check',
    'Planned billable time is on target, but the plan leaves out the training she logs.',
    [
      {
        severity: 'Info',
        check: 'BILLABLE_TARGET',
        planningDate: '',
        jobNo: '',
        resourceNo: 'R0030',
        note: 'Priya logs about 1 hour of training a day that the plan leaves out.',
      },
    ]
  );
  addPlanReview(
    'Project',
    'J00030',
    'Check',
    "This week's plan takes Dealer Portal past its quoted estimate.",
    [
      {
        severity: 'Warning',
        check: 'BUDGET_BURN',
        planningDate: '',
        jobNo: 'J00030',
        resourceNo: '',
        note: 'Time spent plus the hours still planned come to more than the estimate. Agree a change request with Adventure Works.',
      },
    ]
  );

  // --- Project notes and source links ---
  const noteSpecs: Array<Omit<BCProjectNote, 'id' | 'createdByName'> & { by: string }> = [
    {
      jobNo: 'J00010',
      note: 'Kick-off done; design signed off by Fabrikam.',
      createdAt: isoAgo(60 * DAY),
      createdBy: 'ALEX.MORGAN',
      by: 'Alex Morgan',
    },
    {
      jobNo: 'J00010',
      note: 'On track. Trial migration went well; go-live planned for the end of next month.',
      createdAt: isoAgo(2 * DAY),
      createdBy: 'ALEX.MORGAN',
      by: 'Alex Morgan',
    },
    {
      jobNo: 'J00030',
      note: 'Over the estimate after extra single sign-on work. Change request sent to Adventure Works.',
      createdAt: isoAgo(4 * DAY),
      createdBy: 'MORGAN.BLAKE',
      by: 'Morgan Blake',
    },
    {
      jobNo: 'J00020',
      note: 'Build finishing; UAT starts next week with the Northwind warehouse team.',
      createdAt: isoAgo(6 * DAY),
      createdBy: 'PRIYA.SHAH',
      by: 'Priya Shah',
    },
  ];
  const projectNotes: BCProjectNote[] = noteSpecs.map(({ by, ...spec }) => ({
    ...spec,
    id: next(),
    createdByName: by,
  }));

  const sourceLinkSpecs: Array<
    Pick<
      BCProjectSourceLink,
      'jobNo' | 'type' | 'value' | 'jobTaskNo' | 'useMonthlyBlock' | 'learned'
    >
  > = [
    {
      jobNo: 'J00010',
      type: 'MeetingKeyword',
      value: 'Fabrikam ERP',
      jobTaskNo: '',
      useMonthlyBlock: false,
      learned: false,
    },
    {
      jobNo: 'J00010',
      type: 'AttendeeDomain',
      value: 'fabrikam.example',
      jobTaskNo: '',
      useMonthlyBlock: false,
      learned: true,
    },
    {
      jobNo: 'J00020',
      type: 'GitHubRepo',
      value: 'contoso/warehouse-app',
      jobTaskNo: '200',
      useMonthlyBlock: false,
      learned: false,
    },
    {
      jobNo: 'J00040',
      type: 'DevOpsProject',
      value: 'contoso/Tailspin Support',
      jobTaskNo: '100',
      useMonthlyBlock: true,
      learned: false,
    },
  ];
  const sourceLineNos = new Map<string, number>();
  const projectSourceLinks: BCProjectSourceLink[] = sourceLinkSpecs.map((spec) => {
    const n = next();
    const lineNo = (sourceLineNos.get(spec.jobNo) ?? 0) + 10000;
    sourceLineNos.set(spec.jobNo, lineNo);
    return {
      ...spec,
      id: demoGuid(n),
      lineNo,
      createdBy: 'ALEX.MORGAN',
      createdAt: isoAgo(30 * DAY),
      lastModifiedDateTime: isoAgo(30 * DAY),
      '@odata.etag': demoEtag(n),
    };
  });

  return {
    version: DEMO_DATA_VERSION,
    generatedOn: todayStr,
    seq,
    company,
    companyInformation,
    tables: {
      customers,
      employees,
      resources,
      resourceUnitsOfMeasure,
      thymeSetup,
      projects,
      jobTasks,
      jobPlanningLines,
      timeEntries,
      timeSheets,
      timeSheetLines,
      timeSheetDetails,
      timeSuggestions,
      suggestionRequests,
      agentHeartbeats,
      projectSourceLinks,
      projectNotes,
      dayNotes,
      timesheetReviews,
      timesheetReviewLines,
      timesheetReviewRequests: [],
      planReviews,
      planReviewLines,
      planReviewChanges,
      planReviewRequests: [],
    },
  };
}

/** The fixture's people, for the demo data source's simulated Poppie */
export function demoPerson(resourceNo: string): DemoPerson | undefined {
  return DEMO_PEOPLE.find((person) => person.no === resourceNo);
}
