import { describe, it, expect } from 'vitest';
import { formatDate, getWeekStart } from '@/utils/dateUtils';

// UK summer time (BST, UTC+1): local midnight is 23:00 UTC the previous day, which
// is when toISOString() date strings come out a day early. vitest.config.ts runs the
// unit tests in Europe/London.

describe('local dates in BST', () => {
  // Wednesday 30 September 2026, in the week starting Monday 28 September
  const summerWednesday = () => new Date(2026, 8, 30, 10, 0);

  it('runs in a timezone ahead of UTC', () => {
    expect(summerWednesday().getTimezoneOffset()).toBe(-60);
  });

  it('formats the week start as the local Monday, not the UTC Sunday', () => {
    const weekStart = getWeekStart(summerWednesday());
    // The Team tab used this, so BC's exact startingDate filter matched no timesheets
    expect(weekStart.toISOString().split('T')[0]).toBe('2026-09-27');
    expect(formatDate(weekStart)).toBe('2026-09-28');
  });

  it('formats a picked date as the same calendar day', () => {
    // The date pickers hand back local midnight
    expect(formatDate(new Date(2026, 6, 1))).toBe('2026-07-01');
  });

  it('formats winter dates the same way', () => {
    expect(formatDate(getWeekStart(new Date(2026, 11, 2)))).toBe('2026-11-30');
  });
});
