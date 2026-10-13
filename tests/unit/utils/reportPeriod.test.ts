import { describe, it, expect } from 'vitest';
import {
  countWeekdays,
  currentPeriod,
  customPeriod,
  formatPeriod,
  getBreakdownBuckets,
  getBreakdownGranularity,
  getPeriodCapacity,
  getPresetPeriod,
  isCurrentPeriod,
  matchPreset,
  periodOf,
  stepPeriod,
} from '@/utils/reportPeriod';
import type { ReportPeriod } from '@/utils/reportPeriod';

// Tuesday 13 October 2026
const today = new Date(2026, 9, 13, 15, 30);
const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = (p: ReportPeriod) => [day(p.from), day(p.to)];

describe('report period presets', () => {
  it.each([
    ['thisWeek', '2026-10-12', '2026-10-18'],
    ['lastWeek', '2026-10-05', '2026-10-11'],
    ['thisMonth', '2026-10-01', '2026-10-31'],
    ['lastMonth', '2026-09-01', '2026-09-30'],
    ['thisQuarter', '2026-10-01', '2026-12-31'],
    ['lastQuarter', '2026-07-01', '2026-09-30'],
    ['yearToDate', '2026-01-01', '2026-10-13'],
    ['lastYear', '2025-01-01', '2025-12-31'],
  ] as const)('%s is %s to %s', (preset, from, to) => {
    const period = getPresetPeriod(preset, today);
    expect(range(period)).toEqual([from, to]);
    expect(matchPreset(period, today)).toBe(preset);
  });

  it('matches no preset once stepped away from them', () => {
    expect(matchPreset(stepPeriod(getPresetPeriod('lastMonth', today), -1), today)).toBeNull();
  });
});

describe('stepPeriod', () => {
  it('steps calendar periods by their own length', () => {
    expect(range(stepPeriod(periodOf('month', today), -1))).toEqual(['2026-09-01', '2026-09-30']);
    expect(range(stepPeriod(periodOf('quarter', today), 1))).toEqual(['2027-01-01', '2027-03-31']);
    expect(range(stepPeriod(periodOf('week', today), 1))).toEqual(['2026-10-19', '2026-10-25']);
  });

  it('steps the year to date to the same stretch of another year', () => {
    expect(range(stepPeriod(getPresetPeriod('yearToDate', today), -1))).toEqual([
      '2025-01-01',
      '2025-10-13',
    ]);
  });

  it('steps a custom range by its own length', () => {
    const custom = customPeriod(new Date(2026, 2, 10), new Date(2026, 2, 1));
    expect(range(custom)).toEqual(['2026-03-01', '2026-03-10']);
    expect(range(stepPeriod(custom, 1))).toEqual(['2026-03-11', '2026-03-20']);
  });
});

describe('current period', () => {
  it('goes back to the period of the same kind containing today', () => {
    const lastYear = getPresetPeriod('lastYear', today);
    expect(isCurrentPeriod(lastYear, today)).toBe(false);
    expect(range(currentPeriod(lastYear, today))).toEqual(['2026-01-01', '2026-12-31']);
    expect(isCurrentPeriod(getPresetPeriod('yearToDate', today), today)).toBe(true);
  });
});

describe('formatPeriod', () => {
  it('names each kind of period', () => {
    expect(formatPeriod(periodOf('week', today))).toBe('12 - 18 Oct 2026');
    expect(formatPeriod(periodOf('week', new Date(2026, 9, 1)))).toBe('28 Sep - 4 Oct 2026');
    expect(formatPeriod(periodOf('month', today))).toBe('October 2026');
    expect(formatPeriod(periodOf('quarter', today))).toBe('Q4 2026 (Oct - Dec)');
    expect(formatPeriod(getPresetPeriod('lastYear', today))).toBe('2025');
    expect(formatPeriod(getPresetPeriod('yearToDate', today))).toBe('1 Jan - 13 Oct 2026');
    expect(formatPeriod(customPeriod(new Date(2025, 11, 1), new Date(2026, 0, 31)))).toBe(
      '1 Dec 2025 - 31 Jan 2026'
    );
  });
});

describe('period capacity', () => {
  it('is the weekly capacity for each five working days', () => {
    const week = periodOf('week', today);
    expect(countWeekdays(week.from, week.to)).toBe(5);
    expect(getPeriodCapacity(37.5, week.from, week.to)).toBe(37.5);
    // October 2026 has 22 weekdays
    const october = periodOf('month', today);
    expect(getPeriodCapacity(40, october.from, october.to)).toBe(176);
  });
});

describe('breakdown', () => {
  it('uses days for a month, weeks for a quarter and months for longer', () => {
    expect(getBreakdownGranularity(periodOf('month', today))).toBe('day');
    expect(getBreakdownGranularity(periodOf('quarter', today))).toBe('week');
    expect(getBreakdownGranularity(getPresetPeriod('yearToDate', today))).toBe('month');
  });

  it('clips each row to the period and counts its working days', () => {
    const quarter = periodOf('quarter', today);
    const weeks = getBreakdownBuckets(quarter);
    // Thursday 1 October starts mid-week
    expect(weeks[0]).toMatchObject({
      label: 'w/c 28 Sep',
      from: '2026-10-01',
      to: '2026-10-04',
      weekdays: 2,
    });
    expect(weeks.at(-1)).toMatchObject({ from: '2026-12-28', to: '2026-12-31', weekdays: 4 });

    const months = getBreakdownBuckets(getPresetPeriod('yearToDate', today));
    expect(months).toHaveLength(10);
    expect(months.at(-1)).toMatchObject({
      label: 'Oct 2026',
      from: '2026-10-01',
      to: '2026-10-13',
    });
  });
});
