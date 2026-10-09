import { describe, it, expect } from 'vitest';
import {
  CHART_ZOOM_STEPS,
  DEFAULT_CHART_ZOOM,
  canZoomIn,
  canZoomOut,
  describeZoom,
  getChartWindow,
  getMonthLabelStep,
  getMonthLabels,
  getNavStep,
  getPointMarkerSize,
  getWeekStart,
  getWholeProjectWindow,
  isoWeekToDate,
  weeksBetween,
  zoomIn,
  zoomOut,
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

  it('pads a short project out to the narrowest zoom', () => {
    const window = getWholeProjectWindow({
      startDate: date(2026, 9, 7),
      endDate: date(2026, 9, 21),
      firstDataWeek: null,
      lastDataWeek: null,
      currentWeekStart,
    });
    // Starts 4 weeks ago; 8 columns end 3 weeks from now
    expect(window).toEqual({ weeks: CHART_ZOOM_STEPS[0], offsetWeeks: -3 });
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
  it('uses the zoom step and scroll offset', () => {
    expect(getChartWindow(DEFAULT_CHART_ZOOM, 3, twoYears)).toEqual({ weeks: 24, offsetWeeks: 3 });
  });

  it('ignores the scroll offset in whole-project mode', () => {
    expect(getChartWindow({ stepIndex: 2, wholeProject: true }, 3, twoYears)).toEqual(twoYears);
  });

  it('falls back to the zoom step if there is no project to fit', () => {
    expect(getChartWindow({ stepIndex: 1, wholeProject: true }, 0, null)).toEqual({
      weeks: 12,
      offsetWeeks: 0,
    });
  });
});

describe('zooming', () => {
  it('defaults to the long-standing 24-week window', () => {
    expect(CHART_ZOOM_STEPS[DEFAULT_CHART_ZOOM.stepIndex]).toBe(24);
  });

  it('zooms out step by step to the whole project, then stops', () => {
    let zoom = DEFAULT_CHART_ZOOM;
    const seen: string[] = [describeZoom(zoom, twoYears)];
    while (canZoomOut(zoom, twoYears)) {
      zoom = zoomOut(zoom, twoYears);
      seen.push(describeZoom(zoom, twoYears));
    }
    // The last is the whole (105-week) project
    expect(seen).toEqual(['24 wks', '52 wks', '104 wks', '105 wks']);
    expect(zoomOut(zoom, twoYears)).toBe(zoom);
  });

  it('stops at the widest step when there is no project to fit', () => {
    const widest = { stepIndex: CHART_ZOOM_STEPS.length - 1, wholeProject: false };
    expect(canZoomOut(widest, null)).toBe(false);
  });

  it('zooms in to 8 weeks, then stops', () => {
    let zoom = DEFAULT_CHART_ZOOM;
    while (canZoomIn(zoom, twoYears)) zoom = zoomIn(zoom, twoYears);
    expect(describeZoom(zoom, twoYears)).toBe('8 wks');
    expect(zoomIn(zoom, twoYears)).toBe(zoom);
  });

  it('zooms in from the whole project back to the step it came from', () => {
    expect(zoomIn({ stepIndex: 4, wholeProject: true }, twoYears)).toEqual({
      stepIndex: 4,
      wholeProject: false,
    });
  });

  it('zooms in from the whole project to a step narrower than the project', () => {
    // A 20-week project, whole-project chosen while at 104 weeks: 12 weeks, not 104 or 24
    expect(zoomIn({ stepIndex: 4, wholeProject: true }, { weeks: 20, offsetWeeks: 0 })).toEqual({
      stepIndex: 1,
      wholeProject: false,
    });
  });
});

describe('getNavStep', () => {
  it('moves one week at a time up to the default window', () => {
    expect([8, 12, 24].map(getNavStep)).toEqual([1, 1, 1]);
  });

  it('moves further when zoomed out', () => {
    expect(getNavStep(52)).toBe(4);
    expect(getNavStep(104)).toBe(8);
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
    expect(getPointMarkerSize(24)).toBe('normal');
    expect(getPointMarkerSize(52)).toBe('small');
    expect(getPointMarkerSize(104)).toBe('none');
  });
});
