import { formatHours } from './unitConversion';

/**
 * Hours a resource can be allocated per day before they're over capacity.
 *
 * Shared by the Edit Allocation modal's "Other Workload" panel and the Plan grid
 * so both agree on what a working day is. Applies to every day (the modal's
 * bars and hour labels turn red on weekends too).
 */
export const DAILY_CAPACITY_HOURS = 8;

/** Minimal allocation shape needed to work out per-resource daily totals */
export interface DailyResourceAllocation {
  resourceNumber: string;
  resourceName?: string;
  startDate: string; // YYYY-MM-DD
  hoursPerDay: number;
}

/** Total allocated hours keyed by "resourceNumber|YYYY-MM-DD" */
export type ResourceDailyTotals = Map<string, number>;

export interface OverAllocation {
  resourceNumber: string;
  resourceName: string;
  allocatedHours: number;
  overByHours: number;
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
    totals.set(key, (totals.get(key) || 0) + allocation.hoursPerDay);
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
  date: string
): OverAllocation[] {
  const result = new Map<string, OverAllocation>();
  for (const allocation of dayAllocations) {
    if (allocation.startDate !== date || result.has(allocation.resourceNumber)) continue;
    const allocatedHours = dailyTotals.get(dailyTotalKey(allocation.resourceNumber, date)) || 0;
    const overByHours = getOverAllocationHours(allocatedHours);
    if (overByHours > 0) {
      result.set(allocation.resourceNumber, {
        resourceNumber: allocation.resourceNumber,
        resourceName: allocation.resourceName || allocation.resourceNumber,
        allocatedHours,
        overByHours,
      });
    }
  }
  return Array.from(result.values());
}

/** e.g. "Over by 17.5h (25.5h allocated / 8h capacity)", optionally prefixed with the name */
export function formatOverAllocation(overAllocation: OverAllocation, includeName = false): string {
  const detail = `Over by ${formatHours(overAllocation.overByHours)}h (${formatHours(
    overAllocation.allocatedHours
  )}h allocated / ${formatHours(DAILY_CAPACITY_HOURS)}h capacity)`;
  return includeName ? `${overAllocation.resourceName}: ${detail}` : detail;
}

/**
 * Tooltip for a grid cell listing over-allocated resources (one per line),
 * or undefined when everyone on that day is within capacity.
 */
export function getOverAllocationTitle(
  dayAllocations: DailyResourceAllocation[],
  dailyTotals: ResourceDailyTotals,
  date: string,
  includeName = false
): string | undefined {
  const overAllocations = getOverAllocatedResources(dayAllocations, dailyTotals, date);
  if (overAllocations.length === 0) return undefined;
  return overAllocations.map((o) => formatOverAllocation(o, includeName)).join('\n');
}
