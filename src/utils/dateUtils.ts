import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isToday,
  isSameDay,
  parseISO,
  differenceInSeconds,
} from 'date-fns';

// Week starts on Monday
const WEEK_OPTIONS = { weekStartsOn: 1 as const };

// British date format constants
export const DATE_FORMAT_FULL = 'd MMM yyyy'; // e.g., "3 Feb 2026"
export const DATE_FORMAT_SHORT = 'd MMM'; // e.g., "3 Feb"
export const DATE_FORMAT_DAY_SHORT = 'EEE, d MMM'; // e.g., "Mon, 3 Feb"

export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, WEEK_OPTIONS);
}

export function getWeekEnd(date: Date = new Date()): Date {
  return endOfWeek(date, WEEK_OPTIONS);
}

export function getNextWeek(date: Date): Date {
  return addWeeks(date, 1);
}

export function getPreviousWeek(date: Date): Date {
  return subWeeks(date, 1);
}

export function getWeekDays(weekStart: Date): Date[] {
  return eachDayOfInterval({
    start: weekStart,
    end: getWeekEnd(weekStart),
  });
}

export function formatDate(date: Date | string, formatStr: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

export function formatDateForDisplay(date: Date | string): string {
  return formatDate(date, DATE_FORMAT_DAY_SHORT);
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = getWeekEnd(weekStart);
  const startMonth = format(weekStart, 'MMM');
  const endMonth = format(weekEnd, 'MMM');

  if (startMonth === endMonth) {
    return `${format(weekStart, 'd')} - ${format(weekEnd, DATE_FORMAT_FULL)}`;
  }
  return `${format(weekStart, DATE_FORMAT_SHORT)} - ${format(weekEnd, DATE_FORMAT_FULL)}`;
}

export function isDayToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isToday(d);
}

export function isSameDayAs(date1: Date | string, date2: Date | string): boolean {
  const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
  return isSameDay(d1, d2);
}

export function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return '0m';
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

export function hoursToDecimal(hours: number, minutes: number): number {
  return hours + minutes / 60;
}

export function decimalToHoursMinutes(decimal: number): { hours: number; minutes: number } {
  const hours = Math.floor(decimal);
  const minutes = Math.round((decimal - hours) * 60);
  return { hours, minutes };
}

export function getElapsedSeconds(startTime: string | Date): number {
  const start = typeof startTime === 'string' ? parseISO(startTime) : startTime;
  return differenceInSeconds(new Date(), start);
}

export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

// Days since the epoch for a YYYY-MM-DD date; null for missing, invalid or BC's
// "0001-01-01" empty date. Counted in UTC so a clock change can't skew a difference.
function ymdToUTCDays(ymd: string | undefined): number | null {
  const match = ymd ? /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) : null;
  if (!match || match[1] === '0001') return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject dates Date would roll over (e.g. 2027-02-30 -> 2 March)
  const isRealDate = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? date.getTime() / 86_400_000 : null;
}

// How a finish date sits against an end date, e.g. "3 weeks before the end date".
// Under a week is shown in days, otherwise in whole weeks. Null if either date is missing.
export function describeFinishVsEndDate(
  finishDate: string | undefined,
  endDate: string | undefined
): { text: string; isLate: boolean } | null {
  const finish = ymdToUTCDays(finishDate);
  const end = ymdToUTCDays(endDate);
  if (finish === null || end === null) return null;
  const diff = finish - end;
  if (diff === 0) return { text: 'on the end date', isLate: false };
  const days = Math.abs(diff);
  const weeks = Math.round(days / 7);
  const amount =
    days < 7 ? `${days} day${days === 1 ? '' : 's'}` : `${weeks} week${weeks === 1 ? '' : 's'}`;
  return { text: `${amount} ${diff > 0 ? 'after' : 'before'} the end date`, isLate: diff > 0 };
}
