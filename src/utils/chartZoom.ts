/**
 * Time-axis (x-axis) zoom for the project page charts: how many weeks are shown, how far
 * the arrows scroll, the "Whole project" fit and how thinly the month labels are spread.
 *
 * A chart window is described as { weeks, offsetWeeks }: `weeks` columns, ending at the
 * week `offsetWeeks` weeks before the current week (negative = in the future).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Zoom levels in weeks shown, narrowest first. "Whole project" sits beyond the last. */
export const CHART_ZOOM_STEPS = [8, 12, 24, 52, 104] as const;
/** 24 weeks: the charts' long-standing fixed window */
export const DEFAULT_ZOOM_INDEX = 2;
/** Narrowest window a "Whole project" fit is padded out to, so short projects aren't stretched */
export const MIN_WHOLE_PROJECT_WEEKS = CHART_ZOOM_STEPS[0];

export interface ChartZoom {
  /** Index into CHART_ZOOM_STEPS; kept while in whole-project mode so zooming in can return */
  stepIndex: number;
  wholeProject: boolean;
}

export const DEFAULT_CHART_ZOOM: ChartZoom = {
  stepIndex: DEFAULT_ZOOM_INDEX,
  wholeProject: false,
};

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

/** The window actually drawn for a zoom setting */
export function getChartWindow(
  zoom: ChartZoom,
  offsetWeeks: number,
  wholeProject: ChartWindow | null
): ChartWindow {
  if (zoom.wholeProject && wholeProject) return wholeProject;
  return { weeks: CHART_ZOOM_STEPS[zoom.stepIndex], offsetWeeks };
}

export function canZoomIn(zoom: ChartZoom, wholeProject: ChartWindow | null): boolean {
  return (zoom.wholeProject && !!wholeProject) || zoom.stepIndex > 0;
}

export function canZoomOut(zoom: ChartZoom, wholeProject: ChartWindow | null): boolean {
  if (zoom.wholeProject) return false;
  return zoom.stepIndex < CHART_ZOOM_STEPS.length - 1 || !!wholeProject;
}

/** One step wider; past the widest step is "Whole project" (when there's a project to fit) */
export function zoomOut(zoom: ChartZoom, wholeProject: ChartWindow | null): ChartZoom {
  if (!canZoomOut(zoom, wholeProject)) return zoom;
  if (zoom.stepIndex < CHART_ZOOM_STEPS.length - 1) {
    return { ...zoom, stepIndex: zoom.stepIndex + 1 };
  }
  return { ...zoom, wholeProject: true };
}

/**
 * One step narrower. From "Whole project" it returns to the step it came from, but never
 * to one at least as wide as the project itself, which would look like zooming out.
 */
export function zoomIn(zoom: ChartZoom, wholeProject: ChartWindow | null): ChartZoom {
  if (!canZoomIn(zoom, wholeProject)) return zoom;
  if (zoom.wholeProject && wholeProject) {
    let stepIndex = zoom.stepIndex;
    while (stepIndex > 0 && CHART_ZOOM_STEPS[stepIndex] >= wholeProject.weeks) stepIndex--;
    return { stepIndex, wholeProject: false };
  }
  return { ...zoom, stepIndex: zoom.stepIndex - 1 };
}

/**
 * Weeks moved per arrow press (and per tick while held). One week up to the default
 * 24-week window, as before; wider windows move about 1/13 of the window (52 → 4, 104 → 8).
 */
export function getNavStep(weeks: number): number {
  return weeks <= 24 ? 1 : Math.round(weeks / 13);
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
  if (weeks <= 24) return 'normal';
  if (weeks <= 52) return 'small';
  return 'none';
}

/** Weeks currently shown, e.g. "24 wks" (or the project's length in whole-project mode) */
export function describeZoom(zoom: ChartZoom, wholeProject: ChartWindow | null): string {
  return `${getChartWindow(zoom, 0, wholeProject).weeks} wks`;
}
