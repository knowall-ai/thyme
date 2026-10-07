/**
 * Per-person weekly capacity.
 *
 * Thyme BC Extension 1.17+ lets each resource have its own weekly capacity (e.g. 15h for
 * someone who works two days a week) and flexible working days (any days, not fixed
 * weekdays). Without them (older extensions, or "not set") a person's week is their
 * hours per day x 5. An explicit 0 means the person is listed but not counted: they're
 * left out of team capacity, completion and targets (e.g. AI agents).
 */

import type { BCResource } from '@/types';
import {
  DEFAULT_HOURS_PER_DAY,
  WORKING_DAYS_PER_WEEK,
  getResourceHoursPerDay,
  type UOMConversionMap,
} from './unitConversion';

/** Highest weekly capacity BC accepts (hours in a week) */
export const MAX_WEEKLY_CAPACITY_HOURS = 168;

export type WeeklyCapacityFields = Pick<
  BCResource,
  'weeklyCapacityHours' | 'weeklyCapacitySet' | 'flexibleWorkingDays'
>;

export interface WeeklyCapacity {
  /** Hours in the person's week */
  hours: number;
  /** A full working day for them, from their unit of measure (or the default) */
  hoursPerDay: number;
  /** The default for this person: hours per day x 5 (or the configured fallback) */
  defaultHours: number;
  /** true when the person has their own weekly capacity in BC */
  isSet: boolean;
  /** Listed but not counted: their own weekly capacity is 0 */
  excluded: boolean;
  /** Works their weekly capacity on any days rather than fixed weekdays */
  flexible: boolean;
}

const isValidHours = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_WEEKLY_CAPACITY_HOURS;

/**
 * Whether the installed Thyme BC Extension exposes weekly capacity on resources.
 * Older versions don't return the fields at all.
 */
export function hasWeeklyCapacityFields(resources: Pick<BCResource, 'weeklyCapacitySet'>[]) {
  return resources.some((resource) => typeof resource.weeklyCapacitySet === 'boolean');
}

/**
 * A person's weekly capacity: their own when set (and valid), otherwise hours per day x 5.
 * `fallbackWeeklyHours` is used when BC has no usable unit-of-measure rows for them.
 */
export function resolveWeeklyCapacity(
  resource: Pick<BCResource, 'number'> & WeeklyCapacityFields,
  uomConversionMap: UOMConversionMap,
  fallbackWeeklyHours: number
): WeeklyCapacity {
  const ownHoursPerDay = getResourceHoursPerDay(resource.number, uomConversionMap);
  return withWeeklyCapacityFields(
    {
      hoursPerDay: ownHoursPerDay ?? DEFAULT_HOURS_PER_DAY,
      defaultHours:
        ownHoursPerDay === undefined ? fallbackWeeklyHours : ownHoursPerDay * WORKING_DAYS_PER_WEEK,
    },
    resource
  );
}

/**
 * A person's weekly capacity from their working day and default week plus their BC
 * fields, e.g. to apply a capacity just saved without reloading units of measure.
 */
export function withWeeklyCapacityFields(
  base: Pick<WeeklyCapacity, 'hoursPerDay' | 'defaultHours'>,
  resource: WeeklyCapacityFields
): WeeklyCapacity {
  const { hoursPerDay, defaultHours } = base;
  const isSet = resource.weeklyCapacitySet === true && isValidHours(resource.weeklyCapacityHours);
  const hours = isSet ? (resource.weeklyCapacityHours as number) : defaultHours;
  const excluded = isSet && hours === 0;
  return {
    hours,
    hoursPerDay,
    defaultHours,
    isSet,
    excluded,
    flexible: !excluded && resource.flexibleWorkingDays === true,
  };
}

/**
 * Parse a weekly capacity typed into an input: a number from 0 to 168 (rounded to 2dp),
 * or null when it isn't one.
 */
export function parseWeeklyCapacityHours(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!isValidHours(value)) return null;
  return Math.round(value * 100) / 100;
}

/** e.g. "15h a week, flexible days" / "37.5h a week (default: 7.5h x 5)" / "Not counted" */
export function describeWeeklyCapacity(capacity: WeeklyCapacity): string {
  if (capacity.excluded) return 'Not counted: weekly capacity is 0';
  const hours = `${Math.round(capacity.hours * 100) / 100}h a week`;
  const source = capacity.isSet
    ? ''
    : ` (default: ${Math.round(capacity.hoursPerDay * 100) / 100}h x ${WORKING_DAYS_PER_WEEK})`;
  return `${hours}${source}${capacity.flexible ? ', flexible days' : ''}`;
}

/** A friendly message for a failed capacity save; BC decides who may change it */
export function describeCapacitySaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('(403)')) {
    return "You don't have permission in Business Central to change weekly capacity. Ask an administrator.";
  }
  if (message.includes('(412)')) {
    return 'Someone else changed this person in the meantime. Refresh and try again.';
  }
  // An extension without the fields: the endpoint or the property doesn't exist
  if (message.includes('(404)') || (message.includes('(400)') && /does not exist/i.test(message))) {
    return 'Weekly capacity needs a newer version of the Thyme BC Extension.';
  }
  // Any other 400 is BC rejecting the value; show its reason
  if (message.includes('(400)')) {
    // The body is JSON ({"error":{"message":...}}); BC appends "  CorrelationId:  <guid>."
    let reason: string | undefined;
    const jsonStart = message.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const body = JSON.parse(message.slice(jsonStart));
        if (typeof body?.error?.message === 'string') reason = body.error.message;
      } catch {
        reason = undefined;
      }
    }
    reason = reason?.replace(/\s*CorrelationId:.*$/, '').trim() || undefined;
    return reason
      ? `Business Central rejected the change: ${reason}`
      : 'Business Central rejected the change. Check the hours and try again.';
  }
  return 'Failed to save the weekly capacity. Please try again.';
}
