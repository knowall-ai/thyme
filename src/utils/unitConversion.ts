import type { BCResourceUnitOfMeasure } from '@/types';

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

/**
 * Get the hours-per-day factor from resource UOM data.
 *
 * Looks for a specific resource's HOUR factor first, then falls back to any
 * non-1 HOUR factor found in the data (global fallback). Default: 7.5.
 *
 * BC has two configurations:
 * - HOUR > 1: qtyPerUnitOfMeasure is hours-per-day (e.g., 7.5)
 * - HOUR < 1: qtyPerUnitOfMeasure is day-per-hour (e.g., 0.125 = 1/8 = 8 hours/day)
 */
export function getHoursPerDay(
  resourceUOMs: BCResourceUnitOfMeasure[],
  resourceNo?: string
): number {
  // Try specific resource first
  if (resourceNo) {
    const hourUOM = resourceUOMs.find(
      (uom) => uom.resourceNo === resourceNo && uom.code === 'HOUR' && uom.qtyPerUnitOfMeasure !== 1
    );
    if (hourUOM) {
      const qty = hourUOM.qtyPerUnitOfMeasure;
      if (qty > 0 && qty !== 1) {
        return qty > 1 ? qty : 1 / qty;
      }
    }
  }

  // Global fallback: find any resource with a non-1 HOUR factor
  const anyHourUOM = resourceUOMs.find(
    (uom) => uom.code === 'HOUR' && uom.qtyPerUnitOfMeasure > 0 && uom.qtyPerUnitOfMeasure !== 1
  );
  if (anyHourUOM) {
    const qty = anyHourUOM.qtyPerUnitOfMeasure;
    return qty > 1 ? qty : 1 / qty;
  }

  return 8; // Default fallback (standard 8-hour day)
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
