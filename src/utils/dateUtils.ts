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
  return formatDate(date, 'EEE, MMM d');
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = getWeekEnd(weekStart);
  const startMonth = format(weekStart, 'MMM');
  const endMonth = format(weekEnd, 'MMM');

  if (startMonth === endMonth) {
    return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`;
  }
  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
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
