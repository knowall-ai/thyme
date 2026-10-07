import { addDays, format, parseISO } from 'date-fns';
import type { BCTimeSheetDetail } from '@/types';
import { DAILY_CAPACITY_HOURS } from '@/utils';

const DAYS_IN_WEEK = 7;

export interface WeekDailyHours {
  /** Local calendar dates (YYYY-MM-DD) for each day of the week, Monday first */
  days: string[];
  /** Hours per day across every line, aligned with `days` */
  totals: number[];
  /** Hours per day for each timesheet line, keyed by line number and aligned with `days` */
  byLine: Map<number, number[]>;
}

/** Local calendar date key (YYYY-MM-DD), so days don't shift in UK summer time like toISOString() */
export function toLocalDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * The seven local date keys of a timesheet week, starting on its starting date.
 * Empty for BC's placeholder dates (year 0001) or anything unparseable.
 */
export function getTimeSheetWeekDays(startingDate: string): string[] {
  const start = parseISO(startingDate);
  if (Number.isNaN(start.getTime()) || start.getFullYear() <= 1) return [];
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => toLocalDateKey(addDays(start, i)));
}

/**
 * Sum a timesheet's details (one row per line per day) into hours per day,
 * both per line and for the whole week. Details outside the week are ignored.
 */
export function buildWeekDailyHours(
  startingDate: string,
  details: BCTimeSheetDetail[]
): WeekDailyHours {
  const days = getTimeSheetWeekDays(startingDate);
  const dayIndex = new Map(days.map((day, i) => [day, i]));
  const totals = days.map(() => 0);
  const byLine = new Map<number, number[]>();

  for (const detail of details) {
    // BC sends plain dates, but tolerate a timestamp by keeping only its calendar date
    const index = dayIndex.get(detail.date?.slice(0, 10));
    if (index === undefined || !Number.isFinite(detail.quantity)) continue;
    let lineHours = byLine.get(detail.timeSheetLineNo);
    if (!lineHours) {
      lineHours = days.map(() => 0);
      byLine.set(detail.timeSheetLineNo, lineHours);
    }
    lineHours[index] += detail.quantity;
    totals[index] += detail.quantity;
  }

  return { days, totals, byLine };
}

/**
 * Whether a day's hours are over a working day, as a cue for the approver.
 * Rounded to 2dp so floating-point sums like 7.9999999 + 0.0000001 don't flag.
 */
export function isOverDailyHours(hours: number, capacityHours = DAILY_CAPACITY_HOURS): boolean {
  return Math.round(hours * 100) / 100 > capacityHours;
}
