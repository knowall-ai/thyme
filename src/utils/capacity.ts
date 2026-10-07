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

/** "YYYY-MM-DD" dates from that week's Monday up to and including `date` */
function weekDatesUpTo(date: string): string[] {
  const [year, month, day] = date.split('-').map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
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
        projects: Array.from(load?.byProject.values() ?? []).sort(
          (a, b) => b.hours - a.hours || a.projectName.localeCompare(b.projectName)
        ),
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
  const breakdown = overAllocation.projects.map(
    (p) => `  ${p.projectName}: ${formatHours(p.hours)}h`
  );
  return [...lines, ...breakdown].join('\n');
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
