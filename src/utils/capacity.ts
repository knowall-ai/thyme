import { formatHours } from './unitConversion';

/**
 * Hours a resource can be allocated per day before they're over capacity, when BC
 * has no hours per day for them (see getResourceHoursPerDay).
 *
 * Shared by the Edit Allocation modal's "Other Workload" panel and the Plan grid
 * so both agree on what a working day is. Applies to every day (the modal's
 * bars and hour labels turn red on weekends too).
 */
export const DAILY_CAPACITY_HOURS = 8;

/** A resource's daily capacity in hours, e.g. from their unit of measure */
export type CapacityLookup = (resourceNumber: string) => number;

const defaultCapacity: CapacityLookup = () => DAILY_CAPACITY_HOURS;

/**
 * A resource's weekly capacity in hours (see resolveWeeklyCapacity), or null for no
 * weekly cap. 0 means the person isn't counted (e.g. an AI agent), so they're never flagged.
 *
 * A day is over-allocated when it exceeds the person's daily capacity (a full working day),
 * or when their week so far (Monday up to that day) exceeds their weekly capacity. So a
 * part-timer on 15h a week can have a full 7.5h day, but not a third one. This is the same
 * for people on flexible days and on fixed days.
 */
export type WeeklyCapacityLookup = (resourceNumber: string) => number | null;

/** Minimal allocation shape needed to work out per-resource daily totals */
export interface DailyResourceAllocation {
  resourceNumber: string;
  resourceName?: string;
  /** Project the hours are planned on, for the per-project breakdown */
  projectNumber?: string;
  projectName?: string;
  startDate: string; // YYYY-MM-DD
  hoursPerDay: number;
}

/** One project's share of a resource's day */
export interface ProjectDayHours {
  projectNumber: string;
  projectName: string;
  hours: number;
}

/** A resource's total hours on one day across all projects, and how they split by project */
export interface ResourceDayLoad {
  hours: number;
  byProject: Map<string, ProjectDayHours>;
}

/** Each resource's daily load, keyed by "resourceNumber|YYYY-MM-DD" */
export type ResourceDailyTotals = Map<string, ResourceDayLoad>;

export interface OverAllocation {
  resourceNumber: string;
  resourceName: string;
  allocatedHours: number;
  capacityHours: number;
  overByHours: number;
  /** Hours planned from Monday up to this day, when that's over the weekly capacity */
  weekPlannedHours?: number;
  weekCapacityHours?: number;
  weekOverByHours?: number;
  /** Projects planned that day, most hours first */
  projects: ProjectDayHours[];
}

const dailyTotalKey = (resourceNumber: string, date: string) => `${resourceNumber}|${date}`;

/**
 * Hours over capacity (0 when within capacity).
 * Rounded to 2dp so floating-point sums like 7.9999999 + 0.0000001 don't flag.
 */
export function getOverAllocationHours(
  allocatedHours: number,
  capacityHours: number = DAILY_CAPACITY_HOURS
): number {
  const over = Math.round((allocatedHours - capacityHours) * 100) / 100;
  return over > 0 ? over : 0;
}

/** Sum each resource's allocated hours per day across all projects */
export function buildResourceDailyTotals(
  allocations: DailyResourceAllocation[]
): ResourceDailyTotals {
  const totals: ResourceDailyTotals = new Map();
  for (const allocation of allocations) {
    // Skip malformed hours (e.g. a failed unit conversion) rather than poisoning the day's total
    if (!Number.isFinite(allocation.hoursPerDay) || allocation.hoursPerDay < 0) continue;
    const key = dailyTotalKey(allocation.resourceNumber, allocation.startDate);
    let load = totals.get(key);
    if (!load) {
      load = { hours: 0, byProject: new Map() };
      totals.set(key, load);
    }
    load.hours += allocation.hoursPerDay;

    const projectNumber = allocation.projectNumber ?? '';
    const project = load.byProject.get(projectNumber);
    if (project) {
      project.hours += allocation.hoursPerDay;
    } else {
      load.byProject.set(projectNumber, {
        projectNumber,
        projectName: allocation.projectName || projectNumber || '(No project)',
        hours: allocation.hoursPerDay,
      });
    }
  }
  return totals;
}

/** "YYYY-MM-DD" as a UTC date, so day-of-week maths doesn't depend on the time zone */
function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Saturday or Sunday */
function isWeekendDate(date: string): boolean {
  const dayOfWeek = parseDate(date).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** "YYYY-MM-DD" dates from that week's Monday up to and including `date` */
function weekDatesUpTo(date: string): string[] {
  const current = parseDate(date);
  const daysSinceMonday = (current.getUTCDay() + 6) % 7;
  const dates: string[] = [];
  for (let offset = daysSinceMonday; offset >= 0; offset--) {
    const d = new Date(current);
    d.setUTCDate(current.getUTCDate() - offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** A resource's planned hours from Monday up to and including `date` */
export function getWeekToDateHours(
  dailyTotals: ResourceDailyTotals,
  resourceNumber: string,
  date: string
): number {
  return weekDatesUpTo(date).reduce(
    (sum, d) => sum + (dailyTotals.get(dailyTotalKey(resourceNumber, d))?.hours ?? 0),
    0
  );
}

/** A resource's planned hours across the whole week (Monday to Sunday) containing `date` */
export function getWeekHours(
  dailyTotals: ResourceDailyTotals,
  resourceNumber: string,
  date: string
): number {
  const sunday = parseDate(date);
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
  return getWeekToDateHours(dailyTotals, resourceNumber, sunday.toISOString().slice(0, 10));
}

/** A day's projects, most hours first */
const sortedProjects = (load: ResourceDayLoad | undefined): ProjectDayHours[] =>
  Array.from(load?.byProject.values() ?? []).sort(
    (a, b) => b.hours - a.hours || a.projectName.localeCompare(b.projectName)
  );

/** One line per project, for the tooltips */
const formatProjectBreakdown = (projects: ProjectDayHours[]): string[] =>
  projects.map((p) => `  ${p.projectName}: ${formatHours(p.hours)}h`);

/**
 * Resources allocated on a given day (via any of the given allocations) whose total
 * across all projects exceeds their daily capacity, or whose week so far exceeds their
 * weekly capacity (see WeeklyCapacityLookup).
 */
export function getOverAllocatedResources(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  getCapacity: CapacityLookup = defaultCapacity,
  getWeeklyCapacity?: WeeklyCapacityLookup
): OverAllocation[] {
  const result = new Map<string, OverAllocation>();
  const checked = new Set<string>();
  for (const allocation of dayAllocations) {
    if (allocation.startDate !== date || checked.has(allocation.resourceNumber)) continue;
    checked.add(allocation.resourceNumber);
    const weekCapacityHours = getWeeklyCapacity?.(allocation.resourceNumber) ?? null;
    if (weekCapacityHours === 0) continue; // not counted
    const load = dailyTotals.get(dailyTotalKey(allocation.resourceNumber, date));
    const allocatedHours = load?.hours ?? 0;
    const capacityHours = getCapacity(allocation.resourceNumber);
    const overByHours = getOverAllocationHours(allocatedHours, capacityHours);

    let weekly: Pick<OverAllocation, 'weekPlannedHours' | 'weekCapacityHours' | 'weekOverByHours'> =
      {};
    if (weekCapacityHours !== null && allocatedHours > 0) {
      const weekPlannedHours = getWeekToDateHours(dailyTotals, allocation.resourceNumber, date);
      const weekOverByHours = getOverAllocationHours(weekPlannedHours, weekCapacityHours);
      if (weekOverByHours > 0) weekly = { weekPlannedHours, weekCapacityHours, weekOverByHours };
    }

    if (overByHours > 0 || weekly.weekOverByHours) {
      result.set(allocation.resourceNumber, {
        resourceNumber: allocation.resourceNumber,
        resourceName: allocation.resourceName || allocation.resourceNumber,
        allocatedHours,
        capacityHours,
        overByHours,
        ...weekly,
        projects: sortedProjects(load),
      });
    }
  }
  return Array.from(result.values());
}

/**
 * e.g. "Over-allocated: 28.75h planned across 3 projects (capacity 7.5h)", then one
 * line per project. Optionally names the resource, for rows that roll up several people.
 */
export function formatOverAllocation(overAllocation: OverAllocation, includeName = false): string {
  const projectCount = overAllocation.projects.length;
  const prefix = includeName ? `${overAllocation.resourceName} over-allocated` : 'Over-allocated';
  const lines: string[] = [];
  if (overAllocation.overByHours > 0) {
    lines.push(
      `${prefix}: ${formatHours(overAllocation.allocatedHours)}h planned across ${projectCount} ${
        projectCount === 1 ? 'project' : 'projects'
      } (capacity ${formatHours(overAllocation.capacityHours)}h)`
    );
  }
  if (overAllocation.weekOverByHours && overAllocation.weekCapacityHours !== undefined) {
    const weekPrefix = includeName
      ? `${overAllocation.resourceName} over weekly capacity`
      : 'Over weekly capacity';
    lines.push(
      `${weekPrefix}: ${formatHours(overAllocation.weekPlannedHours ?? 0)}h planned this week so far (capacity ${formatHours(overAllocation.weekCapacityHours)}h a week)`
    );
  }
  return [...lines, ...formatProjectBreakdown(overAllocation.projects)].join('\n');
}

/**
 * Tooltip (and accessible label) for a grid cell listing over-allocated resources,
 * or undefined when everyone on that day is within capacity.
 */
export function getOverAllocationTitle(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  includeName = false,
  getCapacity: CapacityLookup = defaultCapacity,
  getWeeklyCapacity?: WeeklyCapacityLookup
): string | undefined {
  const overAllocations = getOverAllocatedResources(
    dayAllocations,
    dailyTotals,
    date,
    getCapacity,
    getWeeklyCapacity
  );
  if (overAllocations.length === 0) return undefined;
  return overAllocations.map((o) => formatOverAllocation(o, includeName)).join('\n');
}

export interface UnderAllocation {
  resourceNumber: string;
  resourceName: string;
  /** Hours planned that day, or that whole week when judged on their weekly capacity */
  plannedHours: number;
  /** Their working day, or their weekly capacity when `weekly` */
  capacityHours: number;
  underByHours: number;
  /** Judged on the whole week against their weekly capacity rather than the day */
  weekly: boolean;
  /** Projects planned that day, most hours first */
  projects: ProjectDayHours[];
}

/**
 * Hours under capacity (0 when at or over capacity).
 * Rounded to 2dp so floating-point sums like 7.4999999 against 7.5 don't flag.
 */
export function getUnderAllocationHours(
  allocatedHours: number,
  capacityHours: number = DAILY_CAPACITY_HOURS
): number {
  const under = Math.round((capacityHours - allocatedHours) * 100) / 100;
  return under > 0 ? under : 0;
}

/**
 * Resources with some hours planned on a given weekday that leave them short of capacity:
 * under their working day, or, for people with a weekly capacity, a week whose total
 * (Monday to Sunday) is under it, which marks every planned weekday of that week.
 * Days with nothing planned and weekends are never flagged, nor is anyone not counted.
 */
export function getUnderAllocatedResources(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  getCapacity: CapacityLookup = defaultCapacity,
  getWeeklyCapacity?: WeeklyCapacityLookup
): UnderAllocation[] {
  if (isWeekendDate(date)) return [];
  const result: UnderAllocation[] = [];
  const checked = new Set<string>();
  for (const allocation of dayAllocations) {
    if (allocation.startDate !== date || checked.has(allocation.resourceNumber)) continue;
    checked.add(allocation.resourceNumber);
    const weekCapacityHours = getWeeklyCapacity?.(allocation.resourceNumber) ?? null;
    if (weekCapacityHours === 0) continue; // not counted
    const load = dailyTotals.get(dailyTotalKey(allocation.resourceNumber, date));
    const allocatedHours = load?.hours ?? 0;
    if (Math.round(allocatedHours * 100) <= 0) continue; // nothing planned

    const weekly = weekCapacityHours !== null;
    const plannedHours = weekly
      ? getWeekHours(dailyTotals, allocation.resourceNumber, date)
      : allocatedHours;
    const capacityHours = weekly ? weekCapacityHours : getCapacity(allocation.resourceNumber);
    const underByHours = getUnderAllocationHours(plannedHours, capacityHours);
    if (underByHours > 0) {
      result.push({
        resourceNumber: allocation.resourceNumber,
        resourceName: allocation.resourceName || allocation.resourceNumber,
        plannedHours,
        capacityHours,
        underByHours,
        weekly,
        projects: sortedProjects(load),
      });
    }
  }
  return result;
}

/**
 * e.g. "Under capacity: 5.5h planned (capacity 8h)" or "Under weekly capacity: 12h planned
 * this week (capacity 15h a week)", then one line per project. Optionally names the resource.
 */
export function formatUnderAllocation(
  underAllocation: UnderAllocation,
  includeName = false
): string {
  const { resourceName, plannedHours, capacityHours, weekly } = underAllocation;
  const reason = weekly ? 'under weekly capacity' : 'under capacity';
  const prefix = includeName
    ? `${resourceName} ${reason}`
    : reason[0].toUpperCase() + reason.slice(1);
  const line = weekly
    ? `${prefix}: ${formatHours(plannedHours)}h planned this week (capacity ${formatHours(capacityHours)}h a week)`
    : `${prefix}: ${formatHours(plannedHours)}h planned (capacity ${formatHours(capacityHours)}h)`;
  return [line, ...formatProjectBreakdown(underAllocation.projects)].join('\n');
}

/**
 * Tooltip (and accessible label) for a grid cell listing under-allocated resources,
 * or undefined when no one planned that day is short of capacity.
 */
export function getUnderAllocationTitle(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  includeName = false,
  getCapacity: CapacityLookup = defaultCapacity,
  getWeeklyCapacity?: WeeklyCapacityLookup
): string | undefined {
  const underAllocations = getUnderAllocatedResources(
    dayAllocations,
    dailyTotals,
    date,
    getCapacity,
    getWeeklyCapacity
  );
  if (underAllocations.length === 0) return undefined;
  return underAllocations.map((u) => formatUnderAllocation(u, includeName)).join('\n');
}

/** How a grid cell is outlined: red when over capacity, amber when under */
export interface CapacityFlag {
  status: 'over' | 'under';
  /** Tooltip (and accessible label) */
  title: string;
}

/**
 * A grid cell's capacity flag, or undefined when everyone planned that day is at capacity.
 * Over-allocation wins: a cell with anyone over capacity is red, never amber.
 */
export function getCapacityFlag(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  includeName = false,
  getCapacity: CapacityLookup = defaultCapacity,
  getWeeklyCapacity?: WeeklyCapacityLookup
): CapacityFlag | undefined {
  const args = [
    dayAllocations,
    dailyTotals,
    date,
    includeName,
    getCapacity,
    getWeeklyCapacity,
  ] as const;
  const overTitle = getOverAllocationTitle(...args);
  if (overTitle) return { status: 'over', title: overTitle };
  const underTitle = getUnderAllocationTitle(...args);
  return underTitle ? { status: 'under', title: underTitle } : undefined;
}
