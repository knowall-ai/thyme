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

/**
 * Resources allocated on a given day (via any of the given allocations) whose total
 * across all projects exceeds their daily capacity.
 */
export function getOverAllocatedResources(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  getCapacity: CapacityLookup = defaultCapacity
): OverAllocation[] {
  const result = new Map<string, OverAllocation>();
  for (const allocation of dayAllocations) {
    if (allocation.startDate !== date || result.has(allocation.resourceNumber)) continue;
    const load = dailyTotals.get(dailyTotalKey(allocation.resourceNumber, date));
    const allocatedHours = load?.hours ?? 0;
    const capacityHours = getCapacity(allocation.resourceNumber);
    const overByHours = getOverAllocationHours(allocatedHours, capacityHours);
    if (overByHours > 0) {
      result.set(allocation.resourceNumber, {
        resourceNumber: allocation.resourceNumber,
        resourceName: allocation.resourceName || allocation.resourceNumber,
        allocatedHours,
        capacityHours,
        overByHours,
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
  const planned = `${formatHours(overAllocation.allocatedHours)}h planned across ${projectCount} ${
    projectCount === 1 ? 'project' : 'projects'
  } (capacity ${formatHours(overAllocation.capacityHours)}h)`;
  const summary = includeName
    ? `${overAllocation.resourceName} over-allocated: ${planned}`
    : `Over-allocated: ${planned}`;
  const breakdown = overAllocation.projects.map(
    (p) => `  ${p.projectName}: ${formatHours(p.hours)}h`
  );
  return [summary, ...breakdown].join('\n');
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
  getCapacity: CapacityLookup = defaultCapacity
): string | undefined {
  const overAllocations = getOverAllocatedResources(dayAllocations, dailyTotals, date, getCapacity);
  if (overAllocations.length === 0) return undefined;
  return overAllocations.map((o) => formatOverAllocation(o, includeName)).join('\n');
}
