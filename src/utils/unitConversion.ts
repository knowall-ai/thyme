import type { BCJobPlanningLine, BCResourceUnitOfMeasure } from '@/types';

/**
 * UOM conversion map: "resourceNo:code" → qtyPerUnitOfMeasure
 * Used to look up conversion factors for a specific resource and unit code.
 */
export type UOMConversionMap = Map<string, number>;

/**
 * Build a UOM conversion map from BC resource unit of measure records.
 * Keys are "resourceNo:code" (e.g., "R001:HOUR"), values are qtyPerUnitOfMeasure.
 */
export function buildUOMConversionMap(resourceUOMs: BCResourceUnitOfMeasure[]): UOMConversionMap {
  const map = new Map<string, number>();
  for (const uom of resourceUOMs) {
    const key = `${uom.resourceNo}:${uom.code}`;
    map.set(key, uom.qtyPerUnitOfMeasure);
  }
  return map;
}

/** Standard working day, used when BC has no usable unit-of-measure data for a resource. */
export const DEFAULT_HOURS_PER_DAY = 8;

/** Working days in a week, used to turn a person's hours per day into weekly capacity. */
export const WORKING_DAYS_PER_WEEK = 5;

/**
 * A resource's working day in hours, from its unit-of-measure rows, or undefined when
 * BC has nothing usable. This is the one rule the app uses for "hours in a day".
 *
 * - DAY-based resource (base unit DAY): the HOUR row holds the hours in a day.
 *   HOUR > 1 is hours-per-day (e.g. 7.5); HOUR < 1 is day-per-hour (0.125 = 8h days).
 * - HOUR-based resource (base unit HOUR): the DAY row holds the hours in a day (e.g. 7.5).
 */
export function getResourceHoursPerDay(
  resourceNo: string,
  uomConversionMap: UOMConversionMap
): number | undefined {
  const hourFactor = uomConversionMap.get(`${resourceNo}:HOUR`);
  if (hourFactor !== undefined && hourFactor > 0 && hourFactor !== 1) {
    return hourFactor > 1 ? hourFactor : 1 / hourFactor;
  }
  const dayFactor = uomConversionMap.get(`${resourceNo}:DAY`);
  if (dayFactor !== undefined && dayFactor > 1) {
    return dayFactor;
  }
  return undefined;
}

/**
 * Get the hours-per-day factor from resource UOM data, defaulting to
 * DEFAULT_HOURS_PER_DAY (8) when the resource is unknown or has no usable rows.
 */
export function getHoursPerDay(
  resourceUOMs: BCResourceUnitOfMeasure[],
  resourceNo?: string
): number {
  if (!resourceNo) return DEFAULT_HOURS_PER_DAY;
  return (
    getResourceHoursPerDay(resourceNo, buildUOMConversionMap(resourceUOMs)) ?? DEFAULT_HOURS_PER_DAY
  );
}

/**
 * A person's weekly capacity in hours: hours per day x 5 working days.
 * Returns `fallback` (the configured default) when BC has no usable unit-of-measure rows.
 */
export function getWeeklyCapacityHours(
  resourceNo: string,
  uomConversionMap: UOMConversionMap,
  fallback: number
): number {
  const hoursPerDay = getResourceHoursPerDay(resourceNo, uomConversionMap);
  return hoursPerDay === undefined ? fallback : hoursPerDay * WORKING_DAYS_PER_WEEK;
}

/**
 * Convert a quantity from a resource's base unit to hours.
 *
 * BC stores planning line quantities in the resource's base unit (DAY or HOUR).
 * If the resource is DAY-based (has a non-1 HOUR conversion factor), the quantity
 * is in days and needs to be multiplied by the hours-per-day factor.
 * If the resource is HOUR-based, the quantity is already in hours.
 *
 * NOTE: We don't trust unitOfMeasureCode from the API because BC may ignore it
 * when creating lines.
 */
export function convertToHours(
  resourceNo: string,
  quantity: number,
  uomConversionMap: UOMConversionMap
): number {
  const hourKey = `${resourceNo}:HOUR`;
  const hourFactor = uomConversionMap.get(hourKey);
  if (hourFactor !== undefined && hourFactor > 0 && hourFactor !== 1) {
    // Resource is DAY-based: convert to hours
    const hoursPerDay = hourFactor > 1 ? hourFactor : 1 / hourFactor;
    return quantity * hoursPerDay;
  }
  // Resource is HOUR-based or no conversion found: quantity is already in hours
  return quantity;
}

/**
 * Convert hours back to a resource's base unit for saving to BC.
 *
 * Inverse of convertToHours: if the resource is DAY-based, divides hours by the
 * hours-per-day factor to get days. If HOUR-based, returns hours as-is.
 */
export function convertFromHours(
  resourceNo: string,
  hours: number,
  uomConversionMap: UOMConversionMap
): number {
  const hourKey = `${resourceNo}:HOUR`;
  const hourFactor = uomConversionMap.get(hourKey);
  if (hourFactor !== undefined && hourFactor > 0 && hourFactor !== 1) {
    // Resource is DAY-based: convert hours to days
    const hoursPerDay = hourFactor > 1 ? hourFactor : 1 / hourFactor;
    return hours / hoursPerDay;
  }
  // Resource is HOUR-based or no conversion found
  return hours;
}

/**
 * Check whether a resource is DAY-based (has a non-1 HOUR conversion factor).
 *
 * DAY-based resources store quantities in days and need conversion to/from hours.
 * HOUR-based resources store quantities directly in hours.
 */
export function isResourceDayBased(
  resourceNo: string,
  uomConversionMap: UOMConversionMap
): boolean {
  const hourKey = `${resourceNo}:HOUR`;
  const hourFactor = uomConversionMap.get(hourKey);
  return hourFactor !== undefined && hourFactor > 0 && hourFactor !== 1;
}

/**
 * Format hours for display, stripping unnecessary trailing zeros.
 * Supports 15-minute (0.25h) increments.
 *
 * Examples: 1.00 → "1", 0.50 → "0.5", 0.25 → "0.25", 8.75 → "8.75"
 */
export function formatHours(hours: number): string {
  return parseFloat(hours.toFixed(2)).toString();
}

/**
 * Decode BC's OData enum-value encoding.
 *
 * BC's OData JSON serializer URL-encodes any character that isn't valid in an
 * identifier as `_xHHHH_`, where HHHH is the UTF-16 code unit in hex. So the
 * planning-line type "G/L Account" arrives as "G_x002F_L_x0020_Account"
 * (`/` → `_x002F_`, space → `_x0020_`), and the lineType "Both Budget and
 * Billable" arrives as "Both_x0020_Budget_x0020_and_x0020_Billable".
 *
 * A literal underscore that would otherwise start an escape is itself encoded
 * as `_x005F_`, so a source value that genuinely contains `_x0020_` arrives as
 * `_x005F_x0020_`. We scan left-to-right and consume each `_xHHHH_` as a single
 * unit, so the `_x005F_` decodes to a literal `_` and the following `x0020_` is
 * left untouched (rather than being re-read as a space).
 *
 * Decoding once at the data boundary lets all downstream comparisons use the
 * plain, human-readable values (e.g. `type === 'G/L Account'`).
 */
export function decodeBCEnum(value: string | undefined): string {
  if (!value) return '';
  // Sticky regex anchors each match at the current scan position, so we never
  // re-scan already-decoded output or share a delimiter `_` between escapes.
  const escape = /_x([0-9A-Fa-f]{4})_/y;
  let result = '';
  let i = 0;
  while (i < value.length) {
    escape.lastIndex = i;
    const match = escape.exec(value);
    if (match) {
      result += String.fromCharCode(parseInt(match[1], 16));
      i += match[0].length;
    } else {
      result += value[i];
      i += 1;
    }
  }
  return result;
}

/**
 * Whether a planning line's `lineType` counts as a Budget line.
 *
 * BC's OData layer URL-encodes spaces in named enum values, so
 * "Both Budget and Billable" arrives over the wire as
 * "Both_x0020_Budget_x0020_and_x0020_Billable" — handle both forms.
 */
export function isBudgetPlanningLine(lineType: string | undefined): boolean {
  return (
    lineType === 'Budget' ||
    lineType === 'Both Budget and Billable' ||
    lineType === 'Both_x0020_Budget_x0020_and_x0020_Billable'
  );
}

/**
 * Sum the planned hours from a project's planning lines.
 *
 * Mirrors the rule used on the project details page: only Resource lines
 * tagged as Budget (or Both Budget and Billable) count, and each line's
 * quantity is converted to hours via the UoM map (so DAY-based resources
 * are scaled by the per-resource hours-per-day factor).
 */
export function sumPlannedHours(
  planningLines: BCJobPlanningLine[],
  uomConversionMap: UOMConversionMap
): number {
  return planningLines
    .filter((line) => line.type === 'Resource' && isBudgetPlanningLine(line.lineType))
    .reduce((sum, line) => sum + convertToHours(line.number, line.quantity, uomConversionMap), 0);
}
