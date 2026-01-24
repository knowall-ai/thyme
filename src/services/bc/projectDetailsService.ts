import { bcClient } from './bcClient';
import type {
  Project,
  Task,
  BCTimeSheet,
  BCTimeSheetLine,
  BCJobPlanningLine,
  BCTimeEntry,
} from '@/types';
import { getWeekStart } from '@/utils';

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

export interface ProjectAnalytics {
  // Billing mode - derived from billablePriceBreakdown
  billingMode: BillingMode;

  // Hours
  hoursSpent: number; // From timesheets (totalQuantity)
  hoursPlanned: number; // From Job Planning Lines (Budget lineType)
  hoursThisWeek: number;
  hoursPosted: number; // From timeEntries (Job Ledger Entry) - posted to ledger
  hoursUnposted: number; // hoursSpent - hoursPosted (in timesheets but not posted)

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
    // Fetch all projects and filter by number (the /jobs endpoint isn't available in all environments)
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

    // Map BC status to Thyme status
    const status: 'active' | 'completed' =
      bcProject.status === 'Completed' ? 'completed' : 'active';

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
      hoursSpent: 0,
      hoursPlanned: 0,
      hoursThisWeek: 0,
      hoursPosted: 0,
      hoursUnposted: 0,
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

    // Get all resources (team members)
    let resources;
    try {
      resources = await bcClient.getResources();
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

    // Get the date 6 months ago for filtering
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const filterDate = sixMonthsAgo.toISOString().split('T')[0];

    // Fetch timesheets for each resource
    const timesheetPromises = resources.map(async (resource) => {
      try {
        // Get timesheets for this resource from the last 6 months
        const timesheets = await bcClient.getTimeSheets(resource.number);

        // Filter to timesheets that started after our filter date
        const recentTimesheets = timesheets.filter(
          (ts: BCTimeSheet) => ts.startingDate >= filterDate
        );

        // For each timesheet, get lines filtered by project
        for (const timesheet of recentTimesheets) {
          try {
            const lines = await bcClient.getTimeSheetLines(timesheet.number);

            // Filter lines for this project
            const projectLines = lines.filter(
              (line: BCTimeSheetLine) => line.type === 'Job' && line.jobNo === projectNumber
            );

            // Get details for each line to get daily hours
            for (const line of projectLines) {
              if (line.totalQuantity > 0) {
                teamMembersSet.add(resource.number);

                // Get the line details for daily breakdown
                const details = await bcClient.getTimeSheetDetails(timesheet.number, line.lineNo);

                for (const detail of details) {
                  if (detail.quantity > 0) {
                    const detailDate = new Date(detail.date);
                    timeEntries.push({
                      resourceNo: resource.number,
                      resourceName: resource.name || resource.number,
                      taskNo: line.jobTaskNo || '',
                      description: line.description || '',
                      hours: detail.quantity,
                      date: detail.date,
                      weekStart: getISOWeek(detailDate),
                      status: line.status,
                    });
                  }
                }
              }
            }
          } catch {
            // Skip timesheet if lines can't be fetched
          }
        }
      } catch {
        // Skip resource if timesheets can't be fetched
      }
    });

    await Promise.all(timesheetPromises);

    // Calculate analytics from collected data
    const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);

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
    const weeklyMap = new Map<string, { total: number; approved: number; pending: number }>();
    for (const entry of timeEntries) {
      const current = weeklyMap.get(entry.weekStart) || { total: 0, approved: 0, pending: 0 };
      current.total += entry.hours;
      // Approved status = approved hours, everything else (Open, Submitted) = pending
      if (entry.status === 'Approved') {
        current.approved += entry.hours;
      } else if (entry.status === 'Open' || entry.status === 'Submitted') {
        current.pending += entry.hours;
      }
      // Note: Rejected hours are excluded from pending/approved but included in total
      weeklyMap.set(entry.weekStart, current);
    }

    // Sort weeks and calculate cumulative
    const sortedWeeks = Array.from(weeklyMap.keys()).sort();
    let cumulative = 0;
    const weeklyData: WeeklyDataPoint[] = sortedWeeks.map((week) => {
      const data = weeklyMap.get(week) || { total: 0, approved: 0, pending: 0 };
      cumulative += data.total;
      return {
        week,
        hours: data.total,
        approvedHours: data.approved,
        pendingHours: data.pending,
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
    let budgetCost = 0;
    let budgetCostBreakdown: CostBreakdown = { resource: 0, item: 0, glAccount: 0, total: 0 };
    let billablePrice = 0;
    let billablePriceBreakdown: CostBreakdown = { resource: 0, item: 0, glAccount: 0, total: 0 };
    // Map for unit price per task (from Job Planning Lines - fallback if Resource doesn't have unitPrice)
    const unitPriceByTask = new Map<string, number>();
    try {
      const planningLines = await bcClient.getJobPlanningLines(projectNumber);

      // Helper to check if lineType includes Budget (handles URL-encoded spaces from API)
      const isBudgetLine = (lineType: string) =>
        lineType === 'Budget' ||
        lineType === 'Both Budget and Billable' ||
        lineType === 'Both_x0020_Budget_x0020_and_x0020_Billable';

      // Helper to check if lineType includes Billable (handles URL-encoded spaces from API)
      const isBillableLine = (lineType: string) =>
        lineType === 'Billable' ||
        lineType === 'Both Budget and Billable' ||
        lineType === 'Both_x0020_Budget_x0020_and_x0020_Billable';

      // Hours Planned: sum quantity from Resource Budget lines only (hours only apply to resources)
      const resourceLines = planningLines.filter(
        (line: BCJobPlanningLine) => line.type === 'Resource'
      );
      hoursPlanned = resourceLines
        .filter((line: BCJobPlanningLine) => isBudgetLine(line.lineType))
        .reduce((sum: number, line: BCJobPlanningLine) => sum + line.quantity, 0);

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
        isBudgetLine(line.lineType)
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
    } catch {
      // If planning lines can't be fetched, leave values as 0
    }

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
      const postedEntries = await bcClient.getTimeEntries(projectNumber);
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
      } else if (hoursPlanned > 0) {
        // Fallback: use resource-only budget rates from planning lines
        // (hoursPlanned only includes resources, so use resource breakdown for accurate rate)
        const avgBudgetCostRate = budgetCostBreakdown.resource / hoursPlanned;
        const avgBillableRate = billablePriceBreakdown.resource / hoursPlanned;
        unpostedCost = hoursUnposted * avgBudgetCostRate;
        unpostedBillable = hoursUnposted * avgBillableRate;
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

      // New BC-aligned terminology
      hoursSpent: totalHours,
      hoursPlanned,
      hoursThisWeek,
      hoursPosted,
      hoursUnposted,
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
