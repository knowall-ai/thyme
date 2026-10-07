const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a BC date (YYYY-MM-DD, optionally with a time part) as a LOCAL date.
 * Returns null for empty values and BC's null-date sentinel ("0001-01-01").
 * Never uses `new Date('YYYY-MM-DD')`, which parses as UTC and can shift the day.
 */
export function parseBCDate(value?: string | null): Date | null {
  if (!value || value.startsWith('0001-')) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
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
}

/** An upcoming end date within this many days is flagged as "soon". */
export const END_DATE_SOON_DAYS = 30;

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
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((end.getTime() - todayStart.getTime()) / 86_400_000);
    if (days < 0) endUrgency = 'overdue';
    else if (days <= END_DATE_SOON_DAYS) endUrgency = 'soon';
  }
  return {
    start: start ? formatShort(start) : 'No start date',
    end: end ? formatShort(end) : 'No end date',
    endUrgency,
  };
}
