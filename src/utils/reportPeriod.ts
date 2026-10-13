/**
 * Report periods: the date ranges Reports can show (a week, month, quarter, year, the
 * year to date or a custom range), stepping back and forward through them, and how a
 * period's hours are broken down (by day, week or month).
 *
 * Weeks start on Monday, as everywhere else in Thyme.
 */

import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isWeekend,
  max as latest,
  min as earliest,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
} from 'date-fns';
import { DATE_FORMAT_DAY_SHORT, DATE_FORMAT_FULL, DATE_FORMAT_SHORT } from './dateUtils';

/** Calendar periods that step by their own length */
export type CalendarUnit = 'week' | 'month' | 'quarter' | 'year';

export type PeriodUnit = CalendarUnit | 'yearToDate' | 'custom';

/** A report period: `from` and `to` are local dates (start of day), inclusive */
export interface ReportPeriod {
  unit: PeriodUnit;
  from: Date;
  to: Date;
}

export type PeriodPreset =
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'yearToDate'
  | 'lastYear';

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'thisWeek', label: 'This week' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'thisQuarter', label: 'This quarter' },
  { id: 'lastQuarter', label: 'Last quarter' },
  { id: 'yearToDate', label: 'Year to date' },
  { id: 'lastYear', label: 'Last year' },
];

const weekOptions = { weekStartsOn: 1 } as const;

/** The week, month, quarter or year containing `date` */
export function periodOf(unit: CalendarUnit, date: Date): ReportPeriod {
  const day = startOfDay(date);
  switch (unit) {
    case 'week':
      return {
        unit,
        from: startOfWeek(day, weekOptions),
        to: startOfDay(endOfWeek(day, weekOptions)),
      };
    case 'month':
      return { unit, from: startOfMonth(day), to: startOfDay(endOfMonth(day)) };
    case 'quarter':
      return { unit, from: startOfQuarter(day), to: startOfDay(endOfQuarter(day)) };
    case 'year':
      return { unit, from: startOfYear(day), to: startOfDay(endOfYear(day)) };
  }
}

/** 1 January to `date` */
function yearToDate(date: Date): ReportPeriod {
  const day = startOfDay(date);
  return { unit: 'yearToDate', from: startOfYear(day), to: day };
}

/** A custom period from two dates in either order */
export function customPeriod(a: Date, b: Date): ReportPeriod {
  const [from, to] = [startOfDay(a), startOfDay(b)].sort((x, y) => x.getTime() - y.getTime());
  return { unit: 'custom', from, to };
}

/** The period a preset means today */
export function getPresetPeriod(preset: PeriodPreset, today: Date = new Date()): ReportPeriod {
  switch (preset) {
    case 'thisWeek':
      return periodOf('week', today);
    case 'lastWeek':
      return periodOf('week', subWeeks(today, 1));
    case 'thisMonth':
      return periodOf('month', today);
    case 'lastMonth':
      return periodOf('month', subMonths(today, 1));
    case 'thisQuarter':
      return periodOf('quarter', today);
    case 'lastQuarter':
      return periodOf('quarter', subQuarters(today, 1));
    case 'yearToDate':
      return yearToDate(today);
    case 'lastYear':
      return periodOf('year', subYears(today, 1));
  }
}

const samePeriod = (a: ReportPeriod, b: ReportPeriod) =>
  a.unit === b.unit && isSameDay(a.from, b.from) && isSameDay(a.to, b.to);

/** The preset a period is today (e.g. this month), or null when it's none of them */
export function matchPreset(period: ReportPeriod, today: Date = new Date()): PeriodPreset | null {
  return (
    PERIOD_PRESETS.find(({ id }) => samePeriod(getPresetPeriod(id, today), period))?.id ?? null
  );
}

/**
 * The period before (-1) or after (+1): the previous month, quarter, etc. The year to
 * date steps to the same stretch of another year (1 Jan to the same day); a custom
 * range steps by its own length.
 */
export function stepPeriod(period: ReportPeriod, direction: 1 | -1): ReportPeriod {
  switch (period.unit) {
    case 'week':
      return periodOf('week', addWeeks(period.from, direction));
    case 'month':
      return periodOf('month', addMonths(period.from, direction));
    case 'quarter':
      return periodOf('quarter', addQuarters(period.from, direction));
    case 'year':
      return periodOf('year', addYears(period.from, direction));
    case 'yearToDate':
      return yearToDate(addYears(period.to, direction));
    case 'custom': {
      const days = (differenceInCalendarDays(period.to, period.from) + 1) * direction;
      return customPeriod(addDays(period.from, days), addDays(period.to, days));
    }
  }
}

/** The same kind of period, but the one containing today (e.g. back to this month) */
export function currentPeriod(period: ReportPeriod, today: Date = new Date()): ReportPeriod {
  if (period.unit === 'custom') return period;
  if (period.unit === 'yearToDate') return yearToDate(today);
  return periodOf(period.unit, today);
}

/** Whether a period is the current one of its kind (a custom range always is) */
export function isCurrentPeriod(period: ReportPeriod, today: Date = new Date()): boolean {
  return samePeriod(currentPeriod(period, today), period);
}

/** A date range in words, e.g. "6 - 12 Oct 2026" or "28 Sep - 4 Oct 2026" */
export function formatDateRange(from: Date, to: Date): string {
  if (isSameDay(from, to)) return format(from, DATE_FORMAT_FULL);
  if (from.getFullYear() !== to.getFullYear()) {
    return `${format(from, DATE_FORMAT_FULL)} - ${format(to, DATE_FORMAT_FULL)}`;
  }
  if (from.getMonth() === to.getMonth()) {
    return `${format(from, 'd')} - ${format(to, DATE_FORMAT_FULL)}`;
  }
  return `${format(from, DATE_FORMAT_SHORT)} - ${format(to, DATE_FORMAT_FULL)}`;
}

/** A period in words, e.g. "October 2026", "Q4 2026 (Oct - Dec)" or "2025" */
export function formatPeriod(period: ReportPeriod): string {
  switch (period.unit) {
    case 'month':
      return format(period.from, 'MMMM yyyy');
    case 'quarter':
      return `Q${format(period.from, 'Q yyyy')} (${format(period.from, 'MMM')} - ${format(period.to, 'MMM')})`;
    case 'year':
      return format(period.from, 'yyyy');
    default:
      return formatDateRange(period.from, period.to);
  }
}

/** Days in a period, inclusive */
export function getPeriodDays(period: Pick<ReportPeriod, 'from' | 'to'>): number {
  return differenceInCalendarDays(period.to, period.from) + 1;
}

/** Monday-to-Friday days from `from` to `to`, inclusive */
export function countWeekdays(from: Date, to: Date): number {
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter((day) => !isWeekend(day)).length;
}

/**
 * Capacity for a period from a weekly capacity: a week's worth for every five working
 * days (Monday to Friday) in it, so one Monday-to-Sunday week is exactly the weekly
 * capacity, as on the Team page. Bank holidays aren't known, so they count as working.
 */
export function getPeriodCapacity(weeklyHours: number, from: Date, to: Date): number {
  return (weeklyHours * countWeekdays(from, to)) / 5;
}

/** How a period's hours are broken down: a row per day, week or month */
export type BreakdownGranularity = 'day' | 'week' | 'month';

/** Days for a month (and a little more) or fewer; weeks up to a quarter; then months */
export function getBreakdownGranularity(period: ReportPeriod): BreakdownGranularity {
  const days = getPeriodDays(period);
  if (days <= 31) return 'day';
  if (days <= 98) return 'week';
  return 'month';
}

/** One row of a breakdown: its dates (YYYY-MM-DD, inclusive, within the period) */
export interface BreakdownBucket {
  key: string;
  label: string;
  from: string;
  to: string;
  /** Monday-to-Friday days in the row, to scale capacity by */
  weekdays: number;
}

/** The rows of a period's breakdown, each clipped to the period */
export function getBreakdownBuckets(
  period: ReportPeriod,
  granularity: BreakdownGranularity = getBreakdownGranularity(period)
): BreakdownBucket[] {
  const interval = { start: period.from, end: period.to };
  const bucket = (start: Date, end: Date, label: string): BreakdownBucket => {
    const from = latest([start, period.from]);
    const to = earliest([end, period.to]);
    return {
      key: format(from, 'yyyy-MM-dd'),
      label,
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd'),
      weekdays: countWeekdays(from, to),
    };
  };

  switch (granularity) {
    case 'day':
      return eachDayOfInterval(interval).map((day) =>
        bucket(day, day, format(day, DATE_FORMAT_DAY_SHORT))
      );
    case 'week':
      return eachWeekOfInterval(interval, weekOptions).map((weekStart) =>
        bucket(
          weekStart,
          startOfDay(endOfWeek(weekStart, weekOptions)),
          // Labelled by the week's Monday, even when the period starts mid-week
          `w/c ${format(weekStart, DATE_FORMAT_SHORT)}`
        )
      );
    case 'month':
      return eachMonthOfInterval(interval).map((monthStart) =>
        bucket(monthStart, startOfDay(endOfMonth(monthStart)), format(monthStart, 'MMM yyyy'))
      );
  }
}
