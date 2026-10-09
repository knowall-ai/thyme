import { describe, it, expect } from 'vitest';
import {
  CHART_RANGES,
  DEFAULT_CHART_RANGE,
  MIN_WHOLE_PROJECT_WEEKS,
  getChartWindow,
  getMonthLabelStep,
  getMaxBackOffset,
  getMonthLabels,
  getNavStep,
  getPointMarkerSize,
  getWeekStart,
  getWholeProjectWindow,
  isoWeekToDate,
  weeksBetween,
  type ChartWindow,
} from '@/utils/chartZoom';

// A Monday, used as "this week" throughout
const currentWeekStart = new Date(2026, 9, 5);
const date = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const twoYears: ChartWindow = { weeks: 105, offsetWeeks: -40 };

describe('week helpers', () => {
  it('finds the Monday of a week, including from a Sunday', () => {
    expect(getWeekStart(date(2026, 10, 11))).toEqual(date(2026, 10, 5));
    expect(getWeekStart(date(2026, 10, 5))).toEqual(date(2026, 10, 5));
  });

  it('turns an ISO week into its Monday', () => {
    expect(isoWeekToDate('2026-W41')).toEqual(date(2026, 10, 5));
    expect(isoWeekToDate('2026-W01')).toEqual(date(2025, 12, 29));
    expect(isoWeekToDate('nonsense')).toBeNull();
  });

  it('counts whole weeks across a clock change', () => {
    // 30 March 2026 is after the BST change on the 29th: still 1 week, not 0.994
    expect(weeksBetween(date(2026, 3, 23), date(2026, 3, 30))).toBe(1);
    expect(weeksBetween(date(2026, 10, 5), date(2026, 9, 7))).toBe(-4);
  });
});

describe('getWholeProjectWindow', () => {
  it('fits the project start date to its end date', () => {
    // Start Wed 1 Oct 2025 (week of 29 Sep), end Wed 30 Sep 2026 (week of 28 Sep)
    const window = getWholeProjectWindow({
      startDate: date(2025, 10, 1),
      endDate: date(2026, 9, 30),
      firstDataWeek: null,
      lastDataWeek: null,
      currentWeekStart,
    });
    expect(window).toEqual({ weeks: 53, offsetWeeks: 1 });
  });

  it('ends in the future for a project still running (negative offset)', () => {
    const window = getWholeProjectWindow({
      startDate: date(2025, 10, 6),
      endDate: date(2027, 9, 27),
      firstDataWeek: null,
      lastDataWeek: null,
      currentWeekStart,
    });
    // Two years of Mondays, 6 Oct 2025 to 27 Sep 2027 inclusive
    expect(window).toEqual({ weeks: 104, offsetWeeks: -51 });
  });

  it('falls back to the first and last weeks with data when the dates are missing', () => {
    expect(
      getWholeProjectWindow({
        startDate: null,
        endDate: null,
        firstDataWeek: date(2026, 1, 5),
        lastDataWeek: date(2026, 10, 5),
        currentWeekStart,
      })
    ).toEqual({ weeks: 40, offsetWeeks: 0 });
  });

  it('widens to include data outside the project dates', () => {
    expect(
      getWholeProjectWindow({
        startDate: date(2026, 3, 2),
        endDate: date(2026, 6, 29),
        firstDataWeek: date(2026, 2, 2),
        lastDataWeek: date(2026, 8, 3),
        currentWeekStart,
      })
    ).toEqual({ weeks: 27, offsetWeeks: 9 });
  });

  it('pads a short project out to 3 months', () => {
    const window = getWholeProjectWindow({
      startDate: date(2026, 9, 7),
      endDate: date(2026, 9, 21),
      firstDataWeek: null,
      lastDataWeek: null,
      currentWeekStart,
    });
    // Starts 4 weeks ago; 13 columns end 8 weeks from now
    expect(window).toEqual({ weeks: MIN_WHOLE_PROJECT_WEEKS, offsetWeeks: -8 });
  });

  it('has nothing to fit without dates or data', () => {
    expect(
      getWholeProjectWindow({
        startDate: null,
        endDate: null,
        firstDataWeek: null,
        lastDataWeek: null,
        currentWeekStart,
      })
    ).toBeNull();
  });
});

describe('getChartWindow', () => {
  it('shows 13, 26 or 52 weeks for 3M, 6M and 1Y, at the scroll offset', () => {
    expect(getChartWindow('3M', 3, twoYears)).toEqual({ weeks: 13, offsetWeeks: 3 });
    expect(getChartWindow('6M', 0, twoYears)).toEqual({ weeks: 26, offsetWeeks: 0 });
    expect(getChartWindow('1Y', -2, twoYears)).toEqual({ weeks: 52, offsetWeeks: -2 });
  });

  it('fits the whole project for All, ignoring the scroll offset', () => {
    expect(getChartWindow('all', 3, twoYears)).toEqual(twoYears);
  });

  it('falls back to the default range for All if there is no project to fit', () => {
    expect(getChartWindow('all', 0, null)).toEqual({ weeks: 26, offsetWeeks: 0 });
  });
});

describe('chart ranges', () => {
  it('offers 3M | 6M | 1Y | All, defaulting to 6M (closest to the old 24-week window)', () => {
    expect(CHART_RANGES.map((r) => r.label)).toEqual(['3M', '6M', '1Y', 'All']);
    expect(DEFAULT_CHART_RANGE).toBe('6M');
  });

  it('gives every range a spoken name and a tooltip', () => {
    for (const r of CHART_RANGES) {
      expect(r.ariaLabel).toBeTruthy();
      expect(r.title).toMatch(/^Show /);
    }
  });
});

describe('getMaxBackOffset', () => {
  it("stops scrolling back when the window starts at the project's first week", () => {
    // The 2-year project's first week is -40 + 105 - 1 = 64 weeks ago
    expect(getMaxBackOffset(twoYears, 52)).toBe(64 - 51);
    expect(getMaxBackOffset(twoYears, 13)).toBe(64 - 12);
  });

  it('always allows scrolling back to this week', () => {
    // A project that started 4 weeks ago, viewed 26 weeks at a time
    expect(getMaxBackOffset({ weeks: 13, offsetWeeks: -8 }, 26)).toBe(0);
  });

  it('has nowhere to go back to without a project to fit', () => {
    expect(getMaxBackOffset(null, 26)).toBe(0);
  });
});

describe('getNavStep', () => {
  it('moves one week at a time for 3M and 6M', () => {
    expect([13, 26].map(getNavStep)).toEqual([1, 1]);
  });

  it('moves further for 1Y', () => {
    expect(getNavStep(52)).toBe(4);
  });
});

describe('month labels', () => {
  it('labels every month up to a year, then thins them out', () => {
    expect([8, 24, 52, 56].map(getMonthLabelStep)).toEqual([1, 1, 1, 1]);
    expect(getMonthLabelStep(104)).toBe(2);
    expect(getMonthLabelStep(156)).toBe(3);
    expect(getMonthLabelStep(300)).toBe(6);
    expect(getMonthLabelStep(1000)).toBe(12);
  });

  it('never gives more than ~13 labels', () => {
    for (const weeks of [8, 24, 52, 80, 104, 156, 260, 520]) {
      expect((weeks * 12) / 52 / getMonthLabelStep(weeks)).toBeLessThanOrEqual(13);
    }
  });

  // Mondays from 29 Dec 2025 for `count` weeks
  const mondays = (count: number) =>
    Array.from({ length: count }, (_, i) => date(2025, 12, 29 + i * 7));

  it('labels the first week of each month', () => {
    const labels = getMonthLabels(mondays(10), 1);
    // 29 Dec at the left edge is the month's last week: no label to collide with January's
    expect(labels.filter(Boolean)).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']);
    expect(labels[1]).toBe('Jan 2026'); // 5 Jan, the first Monday in January
  });

  it('labels a month already under way at the left edge if enough of it is in view', () => {
    // From Mon 12 Jan: three January weeks in view
    expect(getMonthLabels([date(2026, 1, 12), date(2026, 1, 19)], 1)[0]).toBe('Jan 2026');
    // From Mon 19 Jan: only two
    expect(getMonthLabels([date(2026, 1, 19), date(2026, 1, 26)], 1)[0]).toBeUndefined();
  });

  it('keeps only calendar quarters when thinned to every third month', () => {
    const labels = getMonthLabels(mondays(60), 3);
    expect(labels.filter(Boolean)).toEqual([
      'Jan 2026',
      'Apr 2026',
      'Jul 2026',
      'Oct 2026',
      'Jan 2027',
    ]);
  });
});

describe('getPointMarkerSize', () => {
  it('shrinks the markers, then hides them, as the window widens', () => {
    expect(getPointMarkerSize(26)).toBe('normal');
    expect(getPointMarkerSize(52)).toBe('small');
    expect(getPointMarkerSize(104)).toBe('none');
  });
});
