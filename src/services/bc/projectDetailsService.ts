import { bcClient } from './bcClient';
import type { Project, Task, BCTimeSheetLine, BCJobPlanningLine, BCTimeEntry } from '@/types';
import {
  getWeekStart,
  buildUOMConversionMap,
  convertToHours,
  getHoursPerDay,
  isBudgetPlanningLine,
  sumPlannedHours,
} from '@/utils';

// Color palette for projects (same as projectService)
const PROJECT_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

// Breakdown by line type (Resource, Item, G/L Account)
export interface CostBreakdown {
  resource: number;
  item: number;
  glAccount: number;
  total: number;
}

// Billing mode derived from Job Planning Line configuration
export type BillingMode = 'T&M' | 'Fixed Price' | 'Mixed' | 'Not Set';

export interface ResourceHours {
  resourceNo: string;
  name: string;
  hours: number;
  lastDate?: string; // Planned only: the latest planning date (YYYY-MM-DD)
}

export interface ProjectAnalytics {
  // Billing mode - derived from billablePriceBreakdown
  billingMode: BillingMode;

  // Hours per day - from Resource Unit of Measure (DAY conversion factor)
  hoursPerDay: number; // Default 8 if not configured in BC

  // Hours
  hoursSpent: number; // From timesheets (totalQuantity)
  hoursPlanned: number; // From Job Planning Lines (Budget lineType)
  estimateHours: number; // Quoted estimate: Resource Billable lines (incl. Both Budget and Billable)
  futurePlannedHours: number; // Planned (Budget lines) in weeks after the current one - the work still to do
  estimateByResource: ResourceHours[]; // Estimate split by resource, most hours first
  futurePlannedByResource: ResourceHours[]; // Future planned work split by person, most hours first
  hoursThisWeek: number;
  hoursPosted: number; // From timeEntries (Job Ledger Entry) - posted to ledger
  hoursUnposted: number; // hoursSpent - hoursPosted (in timesheets but not posted)
  approvedHours: number; // Hours on Approved timesheet lines (posted time stays Approved)
  pendingHours: number; // Hours on Open or Submitted timesheet lines
  submittedHours: number; // Hours on Submitted lines, awaiting approval
  unsubmittedHours: number; // Hours on Open lines, not yet submitted

  // Costs (internal - hideable) with breakdown by type
  budgetCost: number; // Total from Job Planning Lines totalCost (Budget lineType)
  budgetCostBreakdown: CostBreakdown; // By Resource/Item/G/L Account
  actualCost: number; // Total from timeEntries totalCost (Job Ledger Entry)
  actualCostBreakdown: CostBreakdown; // By Resource/Item/G/L Account
  unpostedCost: number; // Estimated: hoursUnposted × average cost rate

  // Revenue (customer-facing) with breakdown by type
  billablePrice: number; // Total from Job Planning Lines totalPrice (Billable lineType)
  billablePriceBreakdown: CostBreakdown; // By Resource/Item/G/L Account
  invoicedPrice: number; // Total from timeEntries totalPrice (Job Ledger Entry)
  invoicedPriceBreakdown: CostBreakdown; // By Resource/Item/G/L Account
  unpostedBillable: number; // Estimated: hoursUnposted × average billable rate

  // Legacy - kept for backwards compatibility during transition
  totalHours: number; // Alias for hoursSpent
  billableHours: number;
  nonBillableHours: number;
  budgetHours: number; // Alias for hoursPlanned

  // Other analytics
  teamMemberCount: number;
  weeklyData: WeeklyDataPoint[];
  taskBreakdown: TaskBreakdownItem[];
  teamBreakdown: TeamBreakdownItem[];
}

interface WeeklyDataPoint {
  week: string; // ISO week format: "2024-W01"
  hours: number; // Total hours
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open + Submitted timesheets
  unsubmittedHours: number; // The Open (not yet submitted) part of pendingHours
  plannedHours: number; // Budgeted hours from Job Planning Lines (by planningDate)
  cumulative: number;
}

interface TaskBreakdownItem {
  taskNo: string;
  description: string;
  hours: number;
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open + Submitted timesheets
  unitPrice?: number; // Unit price from Resource Card or Job Planning Lines
  teamMembers?: {
    resourceNo: string;
    name: string;
    hours: number;
    approvedHours: number;
    pendingHours: number;
    unitPrice?: number;
  }[];
}

interface TeamBreakdownItem {
  resourceNo: string;
  name: string;
  hours: number;
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open + Submitted timesheets
  unitPrice?: number; // Unit price for this resource from Resource Card or Job Planning Lines
  tasks?: {
    taskNo: string;
    description: string;
    hours: number;
    approvedHours: number;
    pendingHours: number;
  }[];
}

// Local storage key for favorites (shared with projectService)
const FAVORITES_KEY = 'thyme_favorite_projects';

function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FAVORITES_KEY);
  return stored ? JSON.parse(stored) : [];
}

/**
 * Get ISO week string from a date
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const projectDetailsService = {
  /**
   * Fetch project details and tasks by project number
   */
  async getProjectDetails(projectNumber: string): Promise<{ project: Project; tasks: Task[] }> {
    const bcProjects = await bcClient.getProjects();
    const bcProject = bcProjects.find((p) => p.number === projectNumber);

    if (!bcProject) {
      throw new Error(`Project ${projectNumber} not found`);
    }

    const favorites = getFavorites();

    // Get customer name and dates from the project data (from extension's /projects endpoint)
    const customerName = bcProject.billToCustomerName || 'Unknown';
    const startDate = bcProject.startingDate;
    const endDate = bcProject.endingDate;

    // Map BC status to Thyme status — blocked projects are archived
    const isBlocked = bcProject.blocked && bcProject.blocked !== ' ';
    const status: Project['status'] = isBlocked
      ? 'archived'
      : bcProject.status === 'Completed'
        ? 'completed'
        : 'active';

    const project: Project = {
      id: bcProject.id,
      code: bcProject.number,
      name: bcProject.displayName || bcProject.number,
      customerName,
      color: PROJECT_COLORS[bcProject.number.charCodeAt(0) % PROJECT_COLORS.length],
      status,
      isFavorite: favorites.includes(bcProject.id),
      tasks: [],
      startDate,
      endDate,
    };

    // Fetch tasks
    const jobTasks = await bcClient.getJobTasks(projectNumber);
    const postingTasks = jobTasks.filter((task) => task.jobTaskType === 'Posting');

    const tasks: Task[] = postingTasks.map((task) => ({
      id: task.id,
      projectId: project.id,
      code: task.jobTaskNo,
      name: task.description,
      isBillable: true, // Posting tasks are billable
    }));

    project.tasks = tasks;

    return { project, tasks };
  },

  /**
   * Fetch and aggregate analytics data for a project
   * This fetches timesheet data from all resources who have worked on the project
   */
  async getProjectAnalytics(projectNumber: string): Promise<ProjectAnalytics> {
    // Helper to create empty cost breakdown
    const emptyBreakdown = (): CostBreakdown => ({
      resource: 0,
      item: 0,
      glAccount: 0,
      total: 0,
    });

    // Helper to create empty analytics
    const emptyAnalytics = (): ProjectAnalytics => ({
      billingMode: 'Not Set',
      hoursPerDay: 8,
      hoursSpent: 0,
      hoursPlanned: 0,
      estimateHours: 0,
      futurePlannedHours: 0,
      estimateByResource: [],
      futurePlannedByResource: [],
      hoursThisWeek: 0,
      hoursPosted: 0,
      hoursUnposted: 0,
      approvedHours: 0,
      pendingHours: 0,
      submittedHours: 0,
      unsubmittedHours: 0,
      budgetCost: 0,
      budgetCostBreakdown: emptyBreakdown(),
      actualCost: 0,
      actualCostBreakdown: emptyBreakdown(),
      unpostedCost: 0,
      billablePrice: 0,
      billablePriceBreakdown: emptyBreakdown(),
      invoicedPrice: 0,
      invoicedPriceBreakdown: emptyBreakdown(),
      unpostedBillable: 0,
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      budgetHours: 0,
      teamMemberCount: 0,
      weeklyData: [],
      taskBreakdown: [],
      teamBreakdown: [],
    });

    // Check if extension is installed
    const extensionInstalled = await bcClient.isExtensionInstalled();
    if (!extensionInstalled) {
      return emptyAnalytics();
    }

    // No date window: the project's totals cover all its time, however old (a 6-month
    // window used to drop earlier time, so Time Spent shrank as a project aged)
    // Start every independent BC request at once (they used to run one after another);
    // each is awaited, with its own error handling, where its result is used. The no-op
    // catches only stop a rejection being reported as unhandled before it's awaited.
    const resourcesPromise = bcClient.getResources();
    const timesheetsPromise = bcClient.getTimeSheetsFrom();
    const jobLinesPromise = bcClient.getTimeSheetLinesForJob(projectNumber);
    const jobDetailsPromise = bcClient.getTimeSheetDetailsForJob(projectNumber);
    const planningPromise = Promise.all([
      bcClient.getJobPlanningLines(projectNumber),
      bcClient.getResourceUnitsOfMeasure(),
    ]);
    const postedEntriesPromise = bcClient.getTimeEntries(projectNumber);
    for (const p of [
      resourcesPromise,
      timesheetsPromise,
      jobLinesPromise,
      jobDetailsPromise,
      planningPromise,
      postedEntriesPromise,
    ]) {
      p.catch(() => {});
    }

    // Get all resources (team members)
    let resources;
    try {
      resources = await resourcesPromise;
    } catch {
      // If resources can't be fetched, return empty analytics
      return emptyAnalytics();
    }

    // Collect all time entries for this project
    interface TimeEntryData {
      resourceNo: string;
      resourceName: string;
      taskNo: string;
      description: string;
      hours: number;
      date: string;
      weekStart: string;
      status: 'Open' | 'Submitted' | 'Rejected' | 'Approved';
    }

    const timeEntries: TimeEntryData[] = [];
    const teamMembersSet = new Set<string>();

    // This project's timesheet lines and daily details come from project-wide queries,
    // rather than walking every resource's timesheets, then their lines, then each line's
    // details (hundreds of sequential requests). Details don't carry the resource, so it
    // comes from the parent timesheet.
    // A failure here rejects the whole analytics load: one query covers the entire
    // project, so swallowing it would show zero hours that look real
    const [timesheets, jobLines, jobDetails] = await Promise.all([
      timesheetsPromise,
      jobLinesPromise,
      jobDetailsPromise,
    ]);
    const resourceNoByTimesheet = new Map(timesheets.map((ts) => [ts.number, ts.resourceNo]));

    const resourcesByNumber = new Map(resources.map((r) => [r.number, r]));
    const linesByKey = new Map<string, BCTimeSheetLine>();
    for (const line of jobLines) {
      if (line.type !== 'Job' || line.jobNo !== projectNumber || !(line.totalQuantity > 0))
        continue;
      linesByKey.set(`${line.timeSheetNo}|${line.lineNo}`, line);
    }

    for (const detail of jobDetails) {
      if (!(detail.quantity > 0)) continue;
      const line = linesByKey.get(`${detail.timeSheetNo}|${detail.timeSheetLineNo}`);
      // Only people resources (as returned by getResources) count, matching the previous per-resource walk
      const resourceNo = resourceNoByTimesheet.get(detail.timeSheetNo);
      const resource = resourceNo ? resourcesByNumber.get(resourceNo) : undefined;
      if (!line || !resource) continue;

      teamMembersSet.add(resource.number);
      timeEntries.push({
        resourceNo: resource.number,
        resourceName: resource.name || resource.number,
        taskNo: line.jobTaskNo || '',
        description: line.description || '',
        hours: detail.quantity,
        date: detail.date,
        weekStart: getISOWeek(new Date(detail.date)),
        status: line.status,
      });
    }

    // Calculate analytics from collected data
    const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);

    // Status totals: posting needs approval first, so posted time is a subset of approved
    const approvedHours = timeEntries
      .filter((e) => e.status === 'Approved')
      .reduce((sum, e) => sum + e.hours, 0);
    const submittedHours = timeEntries
      .filter((e) => e.status === 'Submitted')
      .reduce((sum, e) => sum + e.hours, 0);
    const unsubmittedHours = timeEntries
      .filter((e) => e.status === 'Open')
      .reduce((sum, e) => sum + e.hours, 0);
    const pendingHours = submittedHours + unsubmittedHours;

    // For now, assume all hours are billable (BC doesn't expose this easily)
    const billableHours = totalHours;
    const nonBillableHours = 0;

    // Hours this week
    const currentWeekStart = getWeekStart(new Date());
    const currentWeekStr = getISOWeek(currentWeekStart);
    const hoursThisWeek = timeEntries
      .filter((e) => e.weekStart === currentWeekStr)
      .reduce((sum, e) => sum + e.hours, 0);

    // Weekly data aggregation - track approved vs pending hours
    const weeklyMap = new Map<
      string,
      { total: number; approved: number; pending: number; unsubmitted: number }
    >();
    for (const entry of timeEntries) {
      const current = weeklyMap.get(entry.weekStart) || {
        total: 0,
        approved: 0,
        pending: 0,
        unsubmitted: 0,
      };
      current.total += entry.hours;
      // Approved status = approved hours, everything else (Open, Submitted) = pending
      if (entry.status === 'Approved') {
        current.approved += entry.hours;
      } else if (entry.status === 'Open' || entry.status === 'Submitted') {
        current.pending += entry.hours;
        if (entry.status === 'Open') current.unsubmitted += entry.hours;
      }
      // Note: Rejected hours are excluded from pending/approved but included in total
      weeklyMap.set(entry.weekStart, current);
    }

    // Sort weeks and calculate cumulative (plannedHours will be added after fetching planning lines)
    const sortedWeeks = Array.from(weeklyMap.keys()).sort();
    let cumulative = 0;
    let weeklyData: WeeklyDataPoint[] = sortedWeeks.map((week) => {
      const data = weeklyMap.get(week) || { total: 0, approved: 0, pending: 0, unsubmitted: 0 };
      cumulative += data.total;
      return {
        week,
        hours: data.total,
        approvedHours: data.approved,
        pendingHours: data.pending,
        unsubmittedHours: data.unsubmitted,
        plannedHours: 0, // Will be populated from planning lines
        cumulative,
      };
    });

    // Build unit price map from Resources (Resource Card's Unit Price field)
    // This is the customer billing rate configured on each Resource
    const unitPriceByResource = new Map<string, number>();
    for (const resource of resources) {
      if (resource.unitPrice !== undefined && resource.unitPrice > 0) {
        unitPriceByResource.set(resource.number, resource.unitPrice);
      }
    }

    // Fetch budget and cost data from Job Planning Lines
    // BC has 3 line types: Resource (labor), Item (products), G/L Account (overhead/services)
    // We include ALL types for totals, but only Resource for hours
    let hoursPlanned = 0;
    let estimateHours = 0;
    // Hours by resource number, for the Estimate and Planned cards' lists
    const estimateHoursByResource = new Map<string, number>();
    const futurePlannedHoursByResource = new Map<string, number>();
    const lastPlannedDateByResource = new Map<string, string>();
    const addHours = (map: Map<string, number>, resourceNo: string, hours: number) =>
      map.set(resourceNo, (map.get(resourceNo) ?? 0) + hours);
    let hoursPerDay = 8; // Default, will be updated from BC if DAY unit is configured
    let budgetCost = 0;
    let budgetCostBreakdown: CostBreakdown = { resource: 0, item: 0, glAccount: 0, total: 0 };
    let billablePrice = 0;
    let billablePriceBreakdown: CostBreakdown = { resource: 0, item: 0, glAccount: 0, total: 0 };
    // Map for unit price per task (from Job Planning Lines - fallback if Resource doesn't have unitPrice)
    const unitPriceByTask = new Map<string, number>();
    try {
      // Planning lines and unit of measure conversion factors (started above)
      const [planningLines, resourceUnitsOfMeasure] = await planningPromise;

      // Build a map for unit of measure conversion: (resourceNo, unitCode) → qtyPerUnitOfMeasure
      // This allows us to convert DAY to HOURS (e.g., 1 DAY = 7.5 HOURS)
      const uomConversionMap = buildUOMConversionMap(resourceUnitsOfMeasure);

      // Derive hoursPerDay from an actual DAY-based resource in the planning lines
      // (picks the first resource that has a non-1 HOUR factor configured in BC)
      const resourceNosInProject = [
        ...new Set(
          planningLines
            .filter((l: BCJobPlanningLine) => l.type === 'Resource')
            .map((l: BCJobPlanningLine) => l.number)
        ),
      ];
      for (const resNo of resourceNosInProject) {
        const hpd = getHoursPerDay(resourceUnitsOfMeasure, resNo);
        if (hpd !== 8) {
          hoursPerDay = hpd;
          break;
        }
      }

      // Helper to check if lineType includes Billable (handles URL-encoded spaces from API)
      const isBillableLine = (lineType: string) =>
        lineType === 'Billable' ||
        lineType === 'Both Budget and Billable' ||
        lineType === 'Both_x0020_Budget_x0020_and_x0020_Billable';

      // Hours Planned: shared helper — sums Resource Budget lines and converts
      // each quantity to hours via the per-resource UoM map.
      hoursPlanned = sumPlannedHours(planningLines, uomConversionMap);
      const resourceLines = planningLines.filter(
        (line: BCJobPlanningLine) => line.type === 'Resource'
      );

      // Extract unit price per resource from planning lines as fallback
      // (only if Resource Card doesn't have unitPrice set)
      for (const line of resourceLines) {
        if (line.number && !unitPriceByResource.has(line.number) && line.unitPrice > 0) {
          unitPriceByResource.set(line.number, line.unitPrice);
        }
        // Also track unit price per task (using the first resource line for that task)
        if (line.jobTaskNo && !unitPriceByTask.has(line.jobTaskNo)) {
          unitPriceByTask.set(line.jobTaskNo, line.unitPrice);
        }
      }

      // Budget Cost: sum totalCost from ALL Budget lines with breakdown by type
      const budgetLines = planningLines.filter((line: BCJobPlanningLine) =>
        isBudgetPlanningLine(line.lineType)
      );
      budgetCost = budgetLines.reduce(
        (sum: number, line: BCJobPlanningLine) => sum + line.totalCost,
        0
      );
      budgetCostBreakdown = {
        resource: budgetLines
          .filter((line: BCJobPlanningLine) => line.type === 'Resource')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalCost, 0),
        item: budgetLines
          .filter((line: BCJobPlanningLine) => line.type === 'Item')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalCost, 0),
        glAccount: budgetLines
          .filter((line: BCJobPlanningLine) => line.type === 'G/L Account')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalCost, 0),
        total: budgetCost,
      };

      // Billable Price: sum totalPrice from ALL Billable lines with breakdown by type
      const billableLines = planningLines.filter((line: BCJobPlanningLine) =>
        isBillableLine(line.lineType)
      );
      billablePrice = billableLines.reduce(
        (sum: number, line: BCJobPlanningLine) => sum + line.totalPrice,
        0
      );
      // Estimate: the quoted time on Billable Resource lines (Budget lines are the Plan
      // screen's weekly allocations), converted to hours via the UoM map
      for (const line of billableLines) {
        if (line.type !== 'Resource') continue;
        const hours = convertToHours(line.number, line.quantity, uomConversionMap);
        estimateHours += hours;
        addHours(estimateHoursByResource, line.number, hours);
      }
      billablePriceBreakdown = {
        resource: billableLines
          .filter((line: BCJobPlanningLine) => line.type === 'Resource')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0),
        item: billableLines
          .filter((line: BCJobPlanningLine) => line.type === 'Item')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0),
        glAccount: billableLines
          .filter((line: BCJobPlanningLine) => line.type === 'G/L Account')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0),
        total: billablePrice,
      };

      // Build planned hours by week from Resource Budget lines with valid planningDate
      // This shows the budgeted hours allocation in the Hours per Week chart
      const plannedHoursMap = new Map<string, number>();
      for (const line of resourceLines) {
        if (!isBudgetPlanningLine(line.lineType)) continue;
        // Skip lines without a valid planning date (0001-01-01 is BC's default empty date)
        if (!line.planningDate || line.planningDate === '0001-01-01') continue;

        // Parse as local date to avoid UTC timezone shift with YYYY-MM-DD strings
        const [y, m, d] = line.planningDate.split('-').map(Number);
        const planDate = new Date(y, m - 1, d);
        if (isNaN(planDate.getTime())) continue;

        const weekStr = getISOWeek(planDate);
        const hours = convertToHours(line.number, line.quantity, uomConversionMap);
        const current = plannedHoursMap.get(weekStr) || 0;
        plannedHoursMap.set(weekStr, current + hours);
        // Same "after this week" rule as futurePlannedHours below
        if (weekStr > currentWeekStr) {
          addHours(futurePlannedHoursByResource, line.number, hours);
          // YYYY-MM-DD strings compare correctly as text
          if (line.planningDate > (lastPlannedDateByResource.get(line.number) ?? '')) {
            lastPlannedDateByResource.set(line.number, line.planningDate);
          }
        }
      }

      // Merge planned hours into weeklyData
      const weeklyDataMap = new Map(weeklyData.map((d) => [d.week, d]));
      for (const [week, plannedHours] of plannedHoursMap) {
        const existing = weeklyDataMap.get(week);
        if (existing) {
          existing.plannedHours = plannedHours;
        } else {
          // Add a new week entry for planned-only weeks (no actual hours yet)
          weeklyDataMap.set(week, {
            week,
            hours: 0,
            approvedHours: 0,
            pendingHours: 0,
            unsubmittedHours: 0,
            plannedHours,
            cumulative: 0, // Will be recalculated below
          });
        }
      }

      // Rebuild weeklyData array sorted with recalculated cumulative
      const allWeeks = Array.from(weeklyDataMap.keys()).sort();
      let newCumulative = 0;
      weeklyData = allWeeks.map((week) => {
        const data = weeklyDataMap.get(week)!;
        newCumulative += data.hours;
        return { ...data, cumulative: newCumulative };
      });
    } catch {
      // If planning lines can't be fetched, leave values as 0
    }

    // Planned work still to do: weeks after this one (matches where the chart's forecast
    // starts adding planned hours), so Time Spent + this = the forecast at completion
    const futurePlannedHours = weeklyData
      .filter((d) => d.week > currentWeekStr)
      .reduce((sum, d) => sum + (d.plannedHours || 0), 0);

    // Resource names from the Resource list (falling back to the number), most hours first
    const toResourceHours = (map: Map<string, number>): ResourceHours[] =>
      [...map]
        .filter(([, hours]) => hours > 0)
        .map(([resourceNo, hours]) => ({
          resourceNo,
          name: resourcesByNumber.get(resourceNo)?.name || resourceNo,
          hours,
          lastDate: lastPlannedDateByResource.get(resourceNo),
        }))
        .sort((a, b) => b.hours - a.hours);
    const estimateByResource = toResourceHours(estimateHoursByResource);
    const futurePlannedByResource = toResourceHours(futurePlannedHoursByResource);

    // Fetch actual cost and invoiced price from Time Entries (Job Ledger Entry)
    // Note: Time entries are all resource-type (labor), so actual/invoiced breakdown is resource-only
    let actualCost = 0;
    let invoicedPrice = 0;
    let hoursPosted = 0;
    // Track posted hours by task and resource for breakdown
    const postedByTask = new Map<string, number>();
    const postedByResource = new Map<string, number>();
    const postedByTaskResource = new Map<string, number>(); // key: "taskNo|resourceNo"
    try {
      const postedEntries = await postedEntriesPromise;
      hoursPosted = postedEntries.reduce(
        (sum: number, entry: BCTimeEntry) => sum + entry.quantity,
        0
      );
      actualCost = postedEntries.reduce(
        (sum: number, entry: BCTimeEntry) => sum + entry.totalCost,
        0
      );
      invoicedPrice = postedEntries.reduce(
        (sum: number, entry: BCTimeEntry) => sum + entry.totalPrice,
        0
      );
      // Build posted hours maps for breakdowns
      for (const entry of postedEntries) {
        const taskKey = entry.jobTaskNo || 'no-task';
        const resourceKey = entry.resourceNo;
        const taskResourceKey = `${taskKey}|${resourceKey}`;
        postedByTask.set(taskKey, (postedByTask.get(taskKey) || 0) + entry.quantity);
        postedByResource.set(
          resourceKey,
          (postedByResource.get(resourceKey) || 0) + entry.quantity
        );
        postedByTaskResource.set(
          taskResourceKey,
          (postedByTaskResource.get(taskResourceKey) || 0) + entry.quantity
        );
      }
    } catch {
      // If time entries can't be fetched, leave values as 0
    }

    // Task breakdown - track approved vs pending based on timesheet status (matches chart)
    const taskMap = new Map<
      string,
      {
        description: string;
        hours: number;
        approvedHours: number;
        pendingHours: number;
        members: Map<
          string,
          { name: string; hours: number; approvedHours: number; pendingHours: number }
        >;
      }
    >();
    for (const entry of timeEntries) {
      const key = entry.taskNo || 'no-task';
      if (!taskMap.has(key)) {
        taskMap.set(key, {
          description: entry.description || 'Unknown Task',
          hours: 0,
          approvedHours: 0,
          pendingHours: 0,
          members: new Map(),
        });
      }
      const task = taskMap.get(key)!;
      task.hours += entry.hours;
      if (entry.status === 'Approved') {
        task.approvedHours += entry.hours;
      } else if (entry.status === 'Open' || entry.status === 'Submitted') {
        task.pendingHours += entry.hours;
      }

      const member = task.members.get(entry.resourceNo);
      if (member) {
        member.hours += entry.hours;
        if (entry.status === 'Approved') {
          member.approvedHours += entry.hours;
        } else if (entry.status === 'Open' || entry.status === 'Submitted') {
          member.pendingHours += entry.hours;
        }
      } else {
        task.members.set(entry.resourceNo, {
          name: entry.resourceName,
          hours: entry.hours,
          approvedHours: entry.status === 'Approved' ? entry.hours : 0,
          pendingHours: entry.status === 'Open' || entry.status === 'Submitted' ? entry.hours : 0,
        });
      }
    }

    const taskBreakdown: TaskBreakdownItem[] = Array.from(taskMap.entries())
      .map(([taskNo, data]) => ({
        taskNo,
        description: data.description,
        hours: data.hours,
        approvedHours: data.approvedHours,
        pendingHours: data.pendingHours,
        unitPrice: unitPriceByTask.get(taskNo),
        teamMembers: Array.from(data.members.entries())
          .map(([resourceNo, memberData]) => ({
            resourceNo,
            name: memberData.name,
            hours: memberData.hours,
            approvedHours: memberData.approvedHours,
            pendingHours: memberData.pendingHours,
            unitPrice: unitPriceByResource.get(resourceNo),
          }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Team breakdown - track approved vs pending based on timesheet status (matches chart)
    const teamMap = new Map<
      string,
      {
        name: string;
        hours: number;
        approvedHours: number;
        pendingHours: number;
        tasks: Map<
          string,
          { description: string; hours: number; approvedHours: number; pendingHours: number }
        >;
      }
    >();
    for (const entry of timeEntries) {
      if (!teamMap.has(entry.resourceNo)) {
        teamMap.set(entry.resourceNo, {
          name: entry.resourceName,
          hours: 0,
          approvedHours: 0,
          pendingHours: 0,
          tasks: new Map(),
        });
      }
      const member = teamMap.get(entry.resourceNo)!;
      member.hours += entry.hours;
      if (entry.status === 'Approved') {
        member.approvedHours += entry.hours;
      } else if (entry.status === 'Open' || entry.status === 'Submitted') {
        member.pendingHours += entry.hours;
      }

      const taskKey = entry.taskNo || 'no-task';
      if (!member.tasks.has(taskKey)) {
        member.tasks.set(taskKey, {
          description: entry.description || 'Unknown Task',
          hours: 0,
          approvedHours: 0,
          pendingHours: 0,
        });
      }
      const task = member.tasks.get(taskKey)!;
      task.hours += entry.hours;
      if (entry.status === 'Approved') {
        task.approvedHours += entry.hours;
      } else if (entry.status === 'Open' || entry.status === 'Submitted') {
        task.pendingHours += entry.hours;
      }
    }

    const teamBreakdown: TeamBreakdownItem[] = Array.from(teamMap.entries())
      .map(([resourceNo, data]) => ({
        resourceNo,
        name: data.name,
        hours: data.hours,
        approvedHours: data.approvedHours,
        pendingHours: data.pendingHours,
        unitPrice: unitPriceByResource.get(resourceNo),
        tasks: Array.from(data.tasks.entries())
          .map(([taskNo, taskData]) => ({
            taskNo,
            description: taskData.description,
            hours: taskData.hours,
            approvedHours: taskData.approvedHours,
            pendingHours: taskData.pendingHours,
          }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Calculate unposted hours and estimated costs
    const hoursUnposted = Math.max(0, totalHours - hoursPosted);

    // Estimate unposted cost/billable using average rates from posted entries
    // If no posted entries, use budget rates from planning lines (resource-only for accuracy)
    let unpostedCost = 0;
    let unpostedBillable = 0;
    if (hoursUnposted > 0) {
      if (hoursPosted > 0) {
        // Use average rates from posted entries
        const avgCostRate = actualCost / hoursPosted;
        const avgBillableRate = invoicedPrice / hoursPosted;
        unpostedCost = hoursUnposted * avgCostRate;
        unpostedBillable = hoursUnposted * avgBillableRate;
      } else if (hoursPlanned > 0 || estimateHours > 0) {
        // Fallback: use resource-only rates from planning lines (resource hours only, so
        // the resource breakdown gives an accurate rate). If a breakdown is 0, the rate is 0,
        // which is correct (nothing defined). Either hours source enables it, so
        // estimate-only projects (no Plan yet) still value unposted time at selling rates.
        if (hoursPlanned > 0) {
          unpostedCost = hoursUnposted * (budgetCostBreakdown.resource / hoursPlanned);
        }
        // Billable price belongs to the estimate's hours, not the Plan's
        const billableHours = estimateHours > 0 ? estimateHours : hoursPlanned;
        unpostedBillable = hoursUnposted * (billablePriceBreakdown.resource / billableHours);
      }
    }

    // Actual/Invoiced breakdowns - time entries are all resource-type (labor)
    const actualCostBreakdown: CostBreakdown = {
      resource: actualCost,
      item: 0,
      glAccount: 0,
      total: actualCost,
    };
    const invoicedPriceBreakdown: CostBreakdown = {
      resource: invoicedPrice,
      item: 0,
      glAccount: 0,
      total: invoicedPrice,
    };

    // Derive billing mode from billable price breakdown
    // T&M: Resource lines only (hourly billing)
    // Fixed Price: Item or G/L Account lines only (deliverable billing)
    // Mixed: Multiple line types
    // Not Set: No billable lines configured
    const hasResource = billablePriceBreakdown.resource > 0;
    const hasItem = billablePriceBreakdown.item > 0;
    const hasGL = billablePriceBreakdown.glAccount > 0;
    const typeCount = [hasResource, hasItem, hasGL].filter(Boolean).length;

    const billingMode: BillingMode =
      typeCount === 0 ? 'Not Set' : typeCount > 1 ? 'Mixed' : hasResource ? 'T&M' : 'Fixed Price';

    return {
      // Billing mode
      billingMode,

      // Hours per day conversion factor (from BC Resource Unit of Measure)
      hoursPerDay,

      // New BC-aligned terminology
      hoursSpent: totalHours,
      hoursPlanned,
      estimateHours,
      futurePlannedHours,
      hoursThisWeek,
      estimateByResource,
      futurePlannedByResource,
      hoursPosted,
      hoursUnposted,
      approvedHours,
      pendingHours,
      submittedHours,
      unsubmittedHours,
      budgetCost,
      budgetCostBreakdown,
      actualCost,
      actualCostBreakdown,
      unpostedCost,
      billablePrice,
      billablePriceBreakdown,
      invoicedPrice,
      invoicedPriceBreakdown,
      unpostedBillable,

      // Legacy fields (aliases for backwards compatibility)
      totalHours,
      billableHours,
      nonBillableHours,
      budgetHours: hoursPlanned,

      // Other analytics
      teamMemberCount: teamMembersSet.size,
      weeklyData,
      taskBreakdown,
      teamBreakdown,
    };
  },

  /**
   * Lightweight fetch of billing mode only (for project list)
   * Fetches Job Planning Lines and computes billing mode without full analytics
   */
  async getBillingMode(projectNumber: string): Promise<BillingMode> {
    try {
      const planningLines = await bcClient.getJobPlanningLines(projectNumber);

      // Helper to check if lineType includes Billable
      const isBillableLine = (lineType: string) =>
        lineType === 'Billable' ||
        lineType === 'Both Budget and Billable' ||
        lineType === 'Both_x0020_Budget_x0020_and_x0020_Billable';

      // Sum billable prices by type
      const billableLines = planningLines.filter((line: BCJobPlanningLine) =>
        isBillableLine(line.lineType)
      );

      const resourcePrice = billableLines
        .filter((line: BCJobPlanningLine) => line.type === 'Resource')
        .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0);
      const itemPrice = billableLines
        .filter((line: BCJobPlanningLine) => line.type === 'Item')
        .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0);
      const glPrice = billableLines
        .filter((line: BCJobPlanningLine) => line.type === 'G/L Account')
        .reduce((sum: number, line: BCJobPlanningLine) => sum + line.totalPrice, 0);

      // Derive billing mode
      const hasResource = resourcePrice > 0;
      const hasItem = itemPrice > 0;
      const hasGL = glPrice > 0;
      const typeCount = [hasResource, hasItem, hasGL].filter(Boolean).length;

      return typeCount === 0
        ? 'Not Set'
        : typeCount > 1
          ? 'Mixed'
          : hasResource
            ? 'T&M'
            : 'Fixed Price';
    } catch {
      return 'Not Set';
    }
  },
};
