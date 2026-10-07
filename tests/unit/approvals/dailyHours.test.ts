import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildWeekDailyHours,
  getTimeSheetWeekDays,
  isOverDailyHours,
  toLocalDateKey,
} from '@/components/approvals/dailyHours';
import type { BCTimeSheetDetail } from '@/types';

function detail(lineNo: number, date: string, quantity: number): BCTimeSheetDetail {
  return {
    id: `${lineNo}-${date}`,
    timeSheetNo: 'TS00001',
    timeSheetLineNo: lineNo,
    date,
    quantity,
  };
}

describe('getTimeSheetWeekDays', () => {
  it('returns seven local dates from the starting date', () => {
    expect(getTimeSheetWeekDays('2026-01-05')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ]);
  });

  it('keeps every day across the clocks going forward', () => {
    // UK summer time starts on Sunday 29 March 2026
    expect(getTimeSheetWeekDays('2026-03-23')).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('is empty for placeholder or invalid dates', () => {
    expect(getTimeSheetWeekDays('0001-01-01')).toEqual([]);
    expect(getTimeSheetWeekDays('not a date')).toEqual([]);
  });
});

describe('buildWeekDailyHours', () => {
  it('sums hours per day overall and per line', () => {
    const result = buildWeekDailyHours('2026-07-06', [
      detail(10000, '2026-07-06', 6),
      detail(20000, '2026-07-06', 3.5),
      detail(10000, '2026-07-07', 7.5),
      detail(20000, '2026-07-12', 2),
    ]);

    expect(result.days[0]).toBe('2026-07-06');
    expect(result.totals).toEqual([9.5, 7.5, 0, 0, 0, 0, 2]);
    expect(result.byLine.get(10000)).toEqual([6, 7.5, 0, 0, 0, 0, 0]);
    expect(result.byLine.get(20000)).toEqual([3.5, 0, 0, 0, 0, 0, 2]);
  });

  it('ignores details outside the week and tolerates timestamps', () => {
    const result = buildWeekDailyHours('2026-07-06', [
      detail(10000, '2026-07-05', 4), // Sunday before the week
      detail(10000, '2026-07-13', 4), // Monday after
      detail(10000, '2026-07-08T00:00:00Z', 5),
    ]);

    expect(result.totals).toEqual([0, 0, 5, 0, 0, 0, 0]);
  });

  it('has no days for a placeholder starting date', () => {
    const result = buildWeekDailyHours('0001-01-01', [detail(10000, '2026-07-06', 8)]);

    expect(result.days).toEqual([]);
    expect(result.totals).toEqual([]);
    expect(result.byLine.size).toBe(0);
  });
});

// vitest.config.ts runs tests in Europe/London, so July is summer time (BST, UTC+1)
describe('toLocalDateKey in UK summer time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the local calendar date just after midnight BST', () => {
    // 00:30 BST on Tuesday 7 July is still 23:30 UTC on Monday 6 July
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T23:30:00Z'));
    const now = new Date();

    expect(now.getTimezoneOffset()).toBe(-60);
    expect(now.toISOString().split('T')[0]).toBe('2026-07-06');
    expect(toLocalDateKey(now)).toBe('2026-07-07');
  });
});

describe('isOverDailyHours', () => {
  it('flags only days over a working day, ignoring floating-point noise', () => {
    expect(isOverDailyHours(8)).toBe(false);
    expect(isOverDailyHours(7.9999999 + 0.0000001)).toBe(false);
    expect(isOverDailyHours(8.25)).toBe(true);
    expect(isOverDailyHours(6, 5)).toBe(true);
  });
});
