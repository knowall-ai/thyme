/**
 * Time-axis (x-axis) range for the project page charts: how many weeks are shown (3M, 6M,
 * 1Y or All = the whole project), how far the arrows scroll and how thinly the month
 * labels are spread.
 *
 * A chart window is described as { weeks, offsetWeeks }: `weeks` columns, ending at the
 * week `offsetWeeks` weeks before the current week (negative = in the future).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ChartRange = '3M' | '6M' | '1Y' | 'all';

export interface ChartRangeOption {
  value: ChartRange;
  label: string;
  /** Spoken name, since "3M" isn't self-explanatory to a screen reader */
  ariaLabel: string;
  title: string;
  /** Weeks shown; null for All, which fits the whole project */
  weeks: number | null;
}

export const CHART_RANGES: ChartRangeOption[] = [
  { value: '3M', label: '3M', ariaLabel: '3 months', title: 'Show 3 months (13 weeks)', weeks: 13 },
  { value: '6M', label: '6M', ariaLabel: '6 months', title: 'Show 6 months (26 weeks)', weeks: 26 },
  { value: '1Y', label: '1Y', ariaLabel: '1 year', title: 'Show 1 year (52 weeks)', weeks: 52 },
  {
    value: 'all',
    label: 'All',
    ariaLabel: 'Whole project',
    title: 'Show the whole project (start date to end date)',
    weeks: null,
  },
];

/** 6M (26 weeks): the closest to the charts' long-standing fixed 24-week window */
export const DEFAULT_CHART_RANGE: ChartRange = '6M';
/** Narrowest window an "All" fit is padded out to, so short projects aren't stretched */
export const MIN_WHOLE_PROJECT_WEEKS = 13;

export interface ChartWindow {
  weeks: number;
  offsetWeeks: number;
}

/** Monday 00:00 (local) of the week containing `date` */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday of an ISO week string (e.g. "2026-W43"), or null if it isn't one */
export function isoWeekToDate(isoWeek: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // Jan 4th is always in ISO week 1
  const monday = getWeekStart(new Date(year, 0, 4));
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

/** Whole weeks from one Monday to another (negative if `to` is earlier); rounds off DST hours */
export function weeksBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / WEEK_MS);
}

/**
 * The window that fits the whole project: from the earlier of the start date and the first
 * week with data, to the later of the end date and the last week with data (data outside
 * the dates, e.g. time logged before the start, stays in view). Whichever of these exist
 * are used; null when none do. Short projects are padded at the end to the narrowest zoom.
 */
export function getWholeProjectWindow({
  startDate,
  endDate,
  firstDataWeek,
  lastDataWeek,
  currentWeekStart,
}: {
  startDate: Date | null;
  endDate: Date | null;
  firstDataWeek: Date | null;
  lastDataWeek: Date | null;
  currentWeekStart: Date;
}): ChartWindow | null {
  const weekStarts = [startDate, endDate, firstDataWeek, lastDataWeek]
    .filter((d): d is Date => d !== null)
    .map(getWeekStart);
  if (weekStarts.length === 0) return null;
  const first = new Date(Math.min(...weekStarts.map((d) => d.getTime())));
  const last = new Date(Math.max(...weekStarts.map((d) => d.getTime())));
  const span = weeksBetween(first, last) + 1;
  const weeks = Math.max(span, MIN_WHOLE_PROJECT_WEEKS);
  // The window ends `weeks - 1` weeks after its first week (later than `last` if padded)
  const endOffsetFromFirst = weeks - 1;
  const firstOffset = weeksBetween(first, currentWeekStart);
  return { weeks, offsetWeeks: firstOffset - endOffsetFromFirst };
}

/**
 * The window actually drawn for a range. All without anything to fit (no dates, no data)
 * falls back to the default range.
 */
export function getChartWindow(
  range: ChartRange,
  offsetWeeks: number,
  wholeProject: ChartWindow | null
): ChartWindow {
  if (range === 'all' && wholeProject) return wholeProject;
  const option = CHART_RANGES.find((r) => r.value === range && r.weeks !== null);
  const weeks = option?.weeks ?? CHART_RANGES.find((r) => r.value === DEFAULT_CHART_RANGE)!.weeks!;
  return { weeks, offsetWeeks };
}

/**
 * Weeks moved per arrow press (and per tick while held). One week up to the default
 * 6-month window, as before; wider windows move about 1/13 of the window (1Y → 4).
 */
export function getNavStep(weeks: number): number {
  return weeks <= 26 ? 1 : Math.round(weeks / 13);
}

/**
 * Months between x-axis labels, so there are at most ~13 labels whatever the zoom:
 * every month up to a year, then every 2nd, 3rd (quarters), 6th or 12th month.
 */
export function getMonthLabelStep(weeks: number): number {
  const months = (weeks * 12) / 52;
  return [1, 2, 3, 6].find((step) => months / step <= 13) ?? 12;
}

/**
 * Month label for each week column (undefined = no label): the first week of each month,
 * keeping only months on the label step (Jan/Apr/Jul/Oct for quarters) once thinned.
 * A month already part-way through at the left edge is only labelled if at least three of
 * its weeks are in view, so its label doesn't run into the next month's.
 */
export function getMonthLabels(weekDates: Date[], monthStep: number): (string | undefined)[] {
  let lastMonth = -1;
  return weekDates.map((date, i) => {
    const month = date.getMonth();
    if (month === lastMonth) return undefined;
    lastMonth = month;
    if (month % monthStep !== 0) return undefined;
    if (i === 0 && date.getDate() > 14) return undefined;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
}

/** Point markers on the Spend vs Budget line: full size, small, or only on hover/this week */
export function getPointMarkerSize(weeks: number): 'normal' | 'small' | 'none' {
  if (weeks <= 26) return 'normal';
  if (weeks <= 52) return 'small';
  return 'none';
}
