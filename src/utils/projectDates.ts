const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a BC date (YYYY-MM-DD, optionally with a time part) as a LOCAL date.
 * Returns null for empty values and BC's null-date sentinel ("0001-01-01").
 * Never uses `new Date('YYYY-MM-DD')`, which parses as UTC and can shift the day.
 */
export function parseBCDate(value?: string | null): Date | null {
  if (!value || value.startsWith('0001-')) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  // Reject overflowed dates such as 2026-02-31
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function formatShort(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export type EndDateUrgency = 'overdue' | 'soon' | 'none';

export interface ProjectDateRange {
  /** e.g. "1 Apr 2026", or "No start date" when the other end exists; null when neither is set */
  start: string | null;
  /** e.g. "31 Mar 2027", or "No end date" when the other end exists; null when neither is set */
  end: string | null;
  /** Only ever non-'none' for an active project with an end date */
  endUrgency: EndDateUrgency;
  /** Says the end date has passed (e.g. "Ended 3 days ago"), so red isn't the only cue */
  endHint?: string;
}

/** An upcoming end date within this many days is flagged as "soon". */
export const END_DATE_SOON_DAYS = 30;

/** Whole calendar days from today to a date: negative once it's passed (today is 0) */
function daysFromToday(date: Date, today: Date): number {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date.getTime() - todayStart.getTime()) / 86_400_000);
}

/**
 * How long ago an active project's end date passed, e.g. "Ended 3 days ago", or null
 * while it hasn't (today itself isn't past), for an empty date, or for a project
 * that isn't active (finished projects are expected to be past their end date).
 * Shared by the Projects list and the project page, so both flag the same projects.
 */
export function describeEndDatePassed(
  endDate: string | undefined,
  isActive: boolean,
  today: Date = new Date()
): string | null {
  const end = parseBCDate(endDate);
  if (!end || !isActive) return null;
  const daysAgo = -daysFromToday(end, today);
  if (daysAgo <= 0) return null;
  return `Ended ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
}

/**
 * Describe a project's start/end dates for the Projects list.
 * `isActive` gates the amber/red urgency; `today` is injectable for tests.
 */
export function describeProjectDates(
  startDate: string | undefined,
  endDate: string | undefined,
  isActive: boolean,
  today: Date = new Date()
): ProjectDateRange {
  const start = parseBCDate(startDate);
  const end = parseBCDate(endDate);
  if (!start && !end) return { start: null, end: null, endUrgency: 'none' };

  let endUrgency: EndDateUrgency = 'none';
  if (end && isActive) {
    const days = daysFromToday(end, today);
    if (days < 0) endUrgency = 'overdue';
    else if (days <= END_DATE_SOON_DAYS) endUrgency = 'soon';
  }
  const endHint = describeEndDatePassed(endDate, isActive, today) ?? undefined;
  return {
    start: start ? formatShort(start) : 'No start date',
    end: end ? formatShort(end) : 'No end date',
    endUrgency,
    ...(endHint && { endHint }),
  };
}
