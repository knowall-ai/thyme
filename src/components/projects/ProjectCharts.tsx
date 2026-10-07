'use client';

import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn, formatCurrencyShort, getCurrencySymbol } from '@/utils';

// Interval for auto-repeat when holding navigation buttons (ms)
const HOLD_INITIAL_DELAY = 400; // Delay before repeat starts
const HOLD_REPEAT_INTERVAL = 100; // Speed of repeat

type ChartView = 'weekly' | 'progress';

// Units for the Spend vs Budget chart. Effort (hours/days) shows no money, so the chart
// can go in a PDF for a customer without exposing internal costs.
type SpendUnit = 'hours' | 'days' | 'cost';
const SPEND_UNITS: { value: SpendUnit; label: string; title: string }[] = [
  {
    value: 'hours',
    label: 'Hours',
    title: 'Effort in hours against the quoted estimate (or the Plan if there is no estimate)',
  },
  {
    value: 'days',
    label: 'Days',
    title: 'Effort in days against the quoted estimate (or the Plan if there is no estimate)',
  },
  { value: 'cost', label: '£', title: 'Time at selling rates against the quoted Billable Price' }, // label replaced by the project currency symbol
];

const WEEKS_TO_SHOW = 24;

// Vertical dashed line marking today's date on a chart
function TodayMarker({ leftPercent }: { leftPercent: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-[1] border-l border-dashed border-sky-400/70"
      style={{ left: `${leftPercent}%` }}
    >
      <span className="absolute -top-4 -translate-x-1/2 text-[10px] font-medium text-sky-400">
        Today
      </span>
    </div>
  );
}

// Shown in place of a chart whose figures are all hidden by the KPI cards' eye toggles
function MaskedChartState({
  title,
  hiddenCards,
  actionLabel,
  onShow,
}: {
  title: string;
  hiddenCards: string[];
  actionLabel: string;
  onShow: () => void;
}) {
  return (
    <div
      role="status"
      className="border-dark-600 flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
    >
      <EyeSlashIcon className="h-6 w-6 text-gray-500" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-300">{title}</p>
      <p className="text-xs text-gray-500">
        {hiddenCards.join(' and ')} {hiddenCards.length > 1 ? 'are' : 'is'} hidden on the cards
        above
      </p>
      <button
        type="button"
        onClick={onShow}
        className="bg-dark-600 hover:bg-dark-500 mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:text-white print:hidden"
      >
        <EyeIcon className="h-4 w-4" aria-hidden="true" />
        {actionLabel}
      </button>
    </div>
  );
}

// Chart title shown only in print, where the on-screen view toggle is hidden
function PrintChartTitle({ children }: { children: ReactNode }) {
  return (
    <div className="bg-thyme-600 mb-4 hidden rounded-lg px-4 py-2 text-sm font-medium text-white print:inline-block">
      {children}
    </div>
  );
}

export function ProjectCharts() {
  // Money here is customer prices, so it's in the project's currency (not the company's)
  const {
    analytics,
    isLoadingAnalytics,
    hiddenKpis,
    toggleKpiHidden,
    projectCurrencyCode,
    project,
  } = useProjectDetailsStore();
  // £ mode is customer-facing (selling rates vs Billable Price), so it follows that card's eye
  const showBillablePrice = !hiddenKpis.includes('Billable Price');
  // ...and the Time Budgeted / Time Spent eyes in effort (hours/days) mode
  // The effort budget is the Estimate card's figure, so it follows that card's eye
  const showTimeBudgeted = !hiddenKpis.includes('Estimate');
  const showTimeSpent = !hiddenKpis.includes('Time Spent');
  const [selectedChartView, setChartView] = useState<ChartView>('weekly');
  // Internal projects have no budget, so there's no Spend vs Budget chart: only Hours per Week
  const isInternal = !!project?.isInternal;
  const chartView: ChartView = isInternal ? 'weekly' : selectedChartView;
  // Days by default: effort is the safe view to share, and matches how projects are planned
  const [spendUnit, setSpendUnit] = useState<SpendUnit>('days');
  // Hours per Week can show hours or days (no money there)
  const [weeklyUnit, setWeeklyUnit] = useState<'hours' | 'days'>('hours');
  // Weeks back from the current week (negative = scrolled into the future)
  const [offsetWeeks, setOffsetWeeks] = useState(0);

  // Furthest forward the charts can scroll: the later of the project end date and the
  // last week with any data (e.g. future planned hours), so upcoming work is visible
  const weeklyData = useMemo(() => analytics?.weeklyData ?? [], [analytics]);
  const projectEndDate = project?.endDate;
  const projectStartDate = project?.startDate;
  const maxForwardWeeks = useMemo(() => {
    const currentWeekStart = getWeekStart(new Date());
    let furthest = 0;
    const lastDataWeek = weeklyData.length
      ? isoWeekToDate(weeklyData[weeklyData.length - 1].week)
      : null;
    if (lastDataWeek) furthest = Math.max(furthest, weeksBetween(currentWeekStart, lastDataWeek));
    // BC's "0001-01-01" null-date sentinel means no end date
    const endDate = parseLocalDate(projectEndDate);
    if (endDate) {
      const endWeek = getWeekStart(endDate);
      furthest = Math.max(furthest, weeksBetween(currentWeekStart, endWeek));
    }
    return furthest;
  }, [weeklyData, projectEndDate]);
  // Read by the hold-to-repeat timers, which outlive a single render
  const minOffsetRef = useRef(0);
  useEffect(() => {
    minOffsetRef.current = -maxForwardWeeks;
  }, [maxForwardWeeks]);

  // Refs for hold-to-repeat functionality
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any running timers
  const clearHoldTimers = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  // Start hold-to-repeat for going back (earlier weeks)
  const startHoldBack = useCallback(() => {
    // Execute immediately on click
    setOffsetWeeks((o) => o + 1);

    // Start repeating after initial delay
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        setOffsetWeeks((o) => o + 1);
      }, HOLD_REPEAT_INTERVAL);
    }, HOLD_INITIAL_DELAY);
  }, []);

  // Start hold-to-repeat for going forward (later weeks)
  const startHoldForward = useCallback(() => {
    // Execute immediately on click
    setOffsetWeeks((o) => Math.max(minOffsetRef.current, o - 1));

    // Start repeating after initial delay
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        setOffsetWeeks((o) => Math.max(minOffsetRef.current, o - 1));
      }, HOLD_REPEAT_INTERVAL);
    }, HOLD_INITIAL_DELAY);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearHoldTimers();
  }, [clearHoldTimers]);

  if (isLoadingAnalytics) {
    return (
      <Card variant="bordered" className="p-6">
        <div className="bg-dark-600 h-64 animate-pulse rounded" />
      </Card>
    );
  }

  const canGoBack = weeklyData.length > 0;
  const canGoForward = offsetWeeks > -maxForwardWeeks;

  return (
    <Card variant="bordered" className="p-6">
      {/* Header with toggle and navigation - hidden in print */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        {/* Chart view toggle - screen only; print shows both charts with their own titles */}
        <div className="flex gap-2 print:hidden">
          <button
            onClick={() => setChartView('weekly')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              chartView === 'weekly'
                ? 'bg-thyme-600 text-white'
                : 'bg-dark-600 text-gray-400 hover:text-white'
            )}
          >
            Hours per Week
          </button>
          {!isInternal && (
            <button
              onClick={() => setChartView('progress')}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                chartView === 'progress'
                  ? 'bg-thyme-600 text-white'
                  : 'bg-dark-600 text-gray-400 hover:text-white'
              )}
            >
              Spend vs Budget
            </button>
          )}
          {/* Unit toggle: Hours | Days for Hours per Week; Hours | Days | £ for Spend vs Budget
              (effort shows no money; £ uses customer-facing selling rates, never internal cost) */}
          <div
            className="border-dark-600 ml-2 flex overflow-hidden rounded-lg border"
            role="group"
            aria-label={chartView === 'progress' ? 'Spend vs Budget units' : 'Hours per Week units'}
          >
            {SPEND_UNITS.filter((u) => chartView === 'progress' || u.value !== 'cost').map((u) => {
              const selected = (chartView === 'progress' ? spendUnit : weeklyUnit) === u.value;
              return (
                <button
                  key={u.value}
                  onClick={() =>
                    chartView === 'progress'
                      ? setSpendUnit(u.value)
                      : setWeeklyUnit(u.value as 'hours' | 'days')
                  }
                  title={
                    chartView === 'progress' ? u.title : `Show ${u.label.toLowerCase()} per week`
                  }
                  aria-pressed={selected}
                  className={cn(
                    'px-3 py-2 text-sm font-medium transition-colors',
                    selected
                      ? 'bg-dark-500 text-white'
                      : 'bg-dark-700 text-gray-400 hover:text-white'
                  )}
                >
                  {u.value === 'cost' ? getCurrencySymbol(projectCurrencyCode) : u.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Navigation - hidden in print */}
        <div className="flex items-center gap-1 print:hidden">
          <button
            onMouseDown={canGoBack ? startHoldBack : undefined}
            onMouseUp={clearHoldTimers}
            onMouseLeave={clearHoldTimers}
            onTouchStart={canGoBack ? startHoldBack : undefined}
            onTouchEnd={clearHoldTimers}
            disabled={!canGoBack}
            className={cn(
              'rounded-lg p-1.5 transition-colors select-none',
              canGoBack
                ? 'bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white'
                : 'bg-dark-700 cursor-not-allowed text-gray-600'
            )}
            title="Previous week (hold to scroll)"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOffsetWeeks(0)}
            disabled={offsetWeeks === 0}
            className={cn(
              'rounded-lg px-3 py-1 text-sm font-medium transition-colors',
              offsetWeeks === 0
                ? 'bg-thyme-600 text-white'
                : 'bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white'
            )}
          >
            This Week
          </button>
          <button
            onMouseDown={canGoForward ? startHoldForward : undefined}
            onMouseUp={clearHoldTimers}
            onMouseLeave={clearHoldTimers}
            onTouchStart={canGoForward ? startHoldForward : undefined}
            onTouchEnd={clearHoldTimers}
            disabled={!canGoForward}
            className={cn(
              'rounded-lg p-1.5 transition-colors select-none',
              canGoForward
                ? 'bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white'
                : 'bg-dark-700 cursor-not-allowed text-gray-600'
            )}
            title="Next week (hold to scroll)"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chart area - the selected chart on screen; both charts in print/PDF */}
      <div className={cn(chartView !== 'weekly' && 'hidden print:block')}>
        <PrintChartTitle>
          {weeklyUnit === 'days' ? 'Days per Week' : 'Hours per Week'}
        </PrintChartTitle>
        <WeeklyBarChart
          data={weeklyData}
          offsetWeeks={offsetWeeks}
          unit={weeklyUnit}
          hoursPerDay={analytics?.hoursPerDay ?? 8}
        />
      </div>
      {!isInternal && (
        <div className={cn('print:mt-6', chartView !== 'progress' && 'hidden print:block')}>
          <PrintChartTitle>
            {spendUnit === 'cost' ? 'Spend vs Budget' : `Effort vs Budget (${spendUnit})`}
          </PrintChartTitle>
          <ProgressLineChart
            data={weeklyData}
            offsetWeeks={offsetWeeks}
            hoursSpent={analytics?.hoursSpent ?? 0}
            hoursPlanned={analytics?.hoursPlanned ?? 0}
            estimateHours={analytics?.estimateHours ?? 0}
            billableResourcePrice={analytics?.billablePriceBreakdown?.resource ?? 0}
            invoicedPrice={analytics?.invoicedPrice ?? 0}
            unpostedBillable={analytics?.unpostedBillable ?? 0}
            showBillablePrice={showBillablePrice}
            showTimeBudgeted={showTimeBudgeted}
            showTimeSpent={showTimeSpent}
            onShowCards={(labels) =>
              labels.filter((l) => hiddenKpis.includes(l)).forEach((l) => toggleKpiHidden(l))
            }
            unit={spendUnit}
            hoursPerDay={analytics?.hoursPerDay ?? 8}
            projectStartDate={projectStartDate}
            projectEndDate={projectEndDate}
            currencyCode={projectCurrencyCode}
          />
        </div>
      )}
    </Card>
  );
}

interface WeeklyDataPoint {
  week: string;
  hours: number;
  approvedHours: number;
  pendingHours: number;
  unsubmittedHours?: number; // The Open (not yet submitted) part of pendingHours
  plannedHours: number; // Budgeted hours from Job Planning Lines
  cumulative: number;
}

interface WeekDisplayData {
  week: string;
  hours: number;
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open/Submitted timesheets
  unsubmittedHours: number; // The Open (not yet submitted) part of pendingHours
  plannedHours: number; // Budgeted hours from Job Planning Lines
  date: Date;
  isCurrentWeek: boolean;
  monthLabel?: string; // Only set for first week of each month
}

/**
 * Get the Monday of the week for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get ISO week string from a date
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Monday of an ISO week string (e.g. "2026-W43")
 */
function isoWeekToDate(isoWeek: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // Jan 4th is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const monday = getWeekStart(jan4);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

/**
 * Parse a BC date ("YYYY-MM-DD", optionally with a time) as a local calendar date, so a
 * date-only value isn't shifted into the previous day by UTC parsing. Returns null for
 * missing/invalid dates and BC's "0001-01-01" null-date sentinel.
 */
function parseLocalDate(value: string | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match || match[1] === '0001') return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Reject dates Date would roll over (e.g. 2026-02-30 -> 2 March)
  const isRealDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isRealDate ? date : null;
}

/**
 * Whole weeks from one Monday to another (negative if `to` is earlier)
 */
function weeksBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Round an axis maximum up to a "nice" top value with ~5 steps of 1, 2, 2.5 or 5 × 10^n,
 * so large values (tens of thousands) don't produce dozens of grid lines.
 */
function getNiceScale(max: number, minTop: number): { top: number; ticks: number[] } {
  const target = Math.max(max, minTop);
  const rough = target / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const steps = Math.ceil(target / step - 1e-9);
  // Round away floating-point noise (0.2 × 3 = 0.6000000000000001)
  const ticks = Array.from({ length: steps + 1 }, (_, i) =>
    Number((i * step).toPrecision(12))
  ).reverse();
  return { top: steps * step, ticks };
}

/**
 * Horizontal position (0-1 within the current week) of today, Monday = 0
 */
function getTodayFractionOfWeek(): number {
  const day = new Date().getDay();
  return (day === 0 ? 6 : day - 1) / 7;
}

/**
 * Generate display data for the chart with all weeks filled in
 */
function generateWeeklyDisplayData(
  data: WeeklyDataPoint[],
  weeksToShow: number,
  offsetWeeks: number
): WeekDisplayData[] {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentWeekStr = getISOWeek(currentWeekStart);

  // Create a map of existing data
  const dataMap = new Map<
    string,
    {
      hours: number;
      approvedHours: number;
      pendingHours: number;
      unsubmittedHours: number;
      plannedHours: number;
    }
  >();
  for (const d of data) {
    dataMap.set(d.week, {
      hours: d.hours,
      approvedHours: d.approvedHours || 0,
      pendingHours: d.pendingHours || 0,
      unsubmittedHours: d.unsubmittedHours || 0,
      plannedHours: d.plannedHours || 0,
    });
  }

  // Calculate the end week (current week minus offset)
  const endWeekDate = new Date(currentWeekStart);
  endWeekDate.setDate(endWeekDate.getDate() - offsetWeeks * 7);

  // Generate weeks array
  const weeks: WeekDisplayData[] = [];
  let lastMonth = -1;

  for (let i = weeksToShow - 1; i >= 0; i--) {
    const weekDate = new Date(endWeekDate);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const weekStr = getISOWeek(weekDate);
    const weekData = dataMap.get(weekStr) ?? {
      hours: 0,
      approvedHours: 0,
      pendingHours: 0,
      unsubmittedHours: 0,
      plannedHours: 0,
    };

    // Determine if we should show month label
    const month = weekDate.getMonth();
    let monthLabel: string | undefined;
    if (month !== lastMonth) {
      monthLabel = weekDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      lastMonth = month;
    }

    weeks.push({
      week: weekStr,
      hours: weekData.hours,
      approvedHours: weekData.approvedHours,
      pendingHours: weekData.pendingHours,
      unsubmittedHours: weekData.unsubmittedHours,
      plannedHours: weekData.plannedHours,
      date: weekDate,
      isCurrentWeek: weekStr === currentWeekStr,
      monthLabel,
    });
  }

  return weeks;
}

interface WeeklyBarChartProps {
  data: WeeklyDataPoint[];
  offsetWeeks: number;
  unit: 'hours' | 'days';
  hoursPerDay: number;
}

function WeeklyBarChart({ data, offsetWeeks, unit, hoursPerDay }: WeeklyBarChartProps) {
  // Values are stored in hours; days = hours ÷ the project's hours per day
  const unitRate = unit === 'days' ? 1 / (hoursPerDay || 8) : 1;
  const formatEffort = (hours: number) =>
    `${(hours * unitRate).toFixed(1)}${unit === 'days' ? 'd' : 'h'}`;
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);

  const displayData = useMemo(
    () => generateWeeklyDisplayData(data, WEEKS_TO_SHOW, offsetWeeks),
    [data, offsetWeeks]
  );

  const legendTotals = useMemo(
    () =>
      displayData.reduce(
        (acc, d) => ({
          planned: acc.planned + d.plannedHours,
          approved: acc.approved + d.approvedHours,
          submitted: acc.submitted + d.pendingHours - d.unsubmittedHours,
          unsubmitted: acc.unsubmitted + d.unsubmittedHours,
        }),
        { planned: 0, approved: 0, submitted: 0, unsubmitted: 0 }
      ),
    [displayData]
  );

  // Y-axis scale from every week of the project (not just the visible ones),
  // so it stays fixed while scrolling back and forward
  const { top: maxHours, ticks: yAxisLabels } = useMemo(() => {
    // Consider both actual hours and planned hours for the max
    const max = Math.max(...data.map((d) => Math.max(d.hours, d.plannedHours || 0)), 0);
    // Nice ticks in the chosen unit; bar heights stay in hours, scaled by the same top
    const scale = getNiceScale(max * unitRate, unit === 'days' ? 1 : 5);
    return { top: scale.top / unitRate, ticks: scale.ticks };
  }, [data, unitRate, unit]);

  const currentWeekIndex = displayData.findIndex((d) => d.isCurrentWeek);

  return (
    <div>
      <div className="flex h-48">
        {/* Y-axis */}
        <div className="flex w-10 flex-col justify-between pr-2 text-right text-xs text-gray-500">
          {yAxisLabels.map((label) => (
            <span key={label}>
              {label}
              {unit === 'days' ? 'd' : ''}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div className="relative flex-1">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {yAxisLabels.map((label) => (
              <div key={label} className="border-dark-600 border-t" />
            ))}
          </div>

          {/* Today marker */}
          {currentWeekIndex >= 0 && (
            <TodayMarker
              leftPercent={
                ((currentWeekIndex + getTodayFractionOfWeek()) / displayData.length) * 100
              }
            />
          )}

          {/* Bars */}
          <div className="relative flex h-full items-end">
            {displayData.map((point) => {
              // Stacked bar heights: approved at the bottom, then submitted, unsubmitted on top
              const submittedHours = point.pendingHours - point.unsubmittedHours;
              const approvedHeightPercent =
                maxHours > 0 ? (point.approvedHours / maxHours) * 100 : 0;
              const submittedHeightPercent = maxHours > 0 ? (submittedHours / maxHours) * 100 : 0;
              const unsubmittedHeightPercent =
                maxHours > 0 ? (point.unsubmittedHours / maxHours) * 100 : 0;
              const plannedHeightPercent = maxHours > 0 ? (point.plannedHours / maxHours) * 100 : 0;
              const isHovered = hoveredWeek === point.week;

              return (
                <div
                  key={point.week}
                  className="group relative flex h-full flex-1 flex-col items-center"
                  onMouseEnter={() => setHoveredWeek(point.week)}
                  onMouseLeave={() => setHoveredWeek(null)}
                >
                  {/* Two bars side by side: Budgeted (grey, left) | Actual (stacked, right) */}
                  <div className="flex h-full w-full items-end justify-center gap-0.5 px-0.5">
                    {/* Budgeted hours bar (grey, left) */}
                    <div className="flex h-full w-full max-w-3 flex-col-reverse items-stretch">
                      {plannedHeightPercent > 0 && (
                        <div
                          className="w-full rounded-t bg-gray-600 transition-all group-hover:bg-gray-500"
                          style={{
                            height: `${plannedHeightPercent}%`,
                            minHeight: '2px',
                          }}
                        />
                      )}
                    </div>
                    {/* Stacked actual hours bar (approved bottom, pending top) - right */}
                    <div className="flex h-full w-full max-w-3 flex-col-reverse items-stretch">
                      {/* Approved hours (bottom of stack - green) */}
                      {approvedHeightPercent > 0 && (
                        <div
                          className={cn(
                            'w-full rounded-t transition-all',
                            point.isCurrentWeek
                              ? 'bg-thyme-400'
                              : 'bg-thyme-600 group-hover:bg-thyme-500'
                          )}
                          style={{
                            height: `${approvedHeightPercent}%`,
                            minHeight: '2px',
                          }}
                        />
                      )}
                      {/* Submitted hours (middle of stack - amber), awaiting approval */}
                      {submittedHeightPercent > 0 && (
                        <div
                          className={cn(
                            'w-full transition-all',
                            point.isCurrentWeek
                              ? 'bg-amber-400'
                              : 'bg-amber-500 group-hover:bg-amber-400',
                            approvedHeightPercent === 0 && 'rounded-t'
                          )}
                          style={{
                            height: `${submittedHeightPercent}%`,
                            minHeight: '2px',
                          }}
                        />
                      )}
                      {/* Unsubmitted hours (top of stack - faded amber), still on Open timesheets */}
                      {unsubmittedHeightPercent > 0 && (
                        <div
                          className={cn(
                            'w-full transition-all',
                            point.isCurrentWeek
                              ? 'bg-amber-400/50'
                              : 'bg-amber-500/40 group-hover:bg-amber-400/50',
                            approvedHeightPercent === 0 &&
                              submittedHeightPercent === 0 &&
                              'rounded-t'
                          )}
                          style={{
                            height: `${unsubmittedHeightPercent}%`,
                            minHeight: '2px',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Tooltip */}
                  {isHovered && (
                    <div className="bg-dark-700 absolute -top-28 left-1/2 z-10 -translate-x-1/2 rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                      <div className="font-medium text-white">
                        {point.date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      {point.plannedHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="inline-block h-2 w-2 rounded-sm bg-gray-500" />
                          Planned: {formatEffort(point.plannedHours)}
                        </div>
                      )}
                      {point.approvedHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="bg-thyme-500 inline-block h-2 w-2 rounded-sm" />
                          Approved: {formatEffort(point.approvedHours)}
                        </div>
                      )}
                      {point.pendingHours - point.unsubmittedHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                          Submitted: {formatEffort(point.pendingHours - point.unsubmittedHours)}
                        </div>
                      )}
                      {point.unsubmittedHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/40" />
                          Unsubmitted: {formatEffort(point.unsubmittedHours)}
                        </div>
                      )}
                      {point.hours === 0 && point.plannedHours === 0 && (
                        <div className="text-gray-400">No hours</div>
                      )}
                      {point.isCurrentWeek && <div className="text-thyme-400">This week</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis with month labels */}
      <div className="mt-2 ml-10 flex">
        {displayData.map((point) => (
          <div key={point.week} className="flex-1 text-center">
            {point.monthLabel && <span className="text-xs text-gray-500">{point.monthLabel}</span>}
          </div>
        ))}
      </div>

      {/* Legend — totals are summed across the visible weeks */}
      <div className="mt-3 flex items-center justify-center gap-6 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-600" />
          <span>Planned ({formatEffort(legendTotals.planned)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-thyme-500 inline-block h-2.5 w-2.5 rounded-sm" />
          <span>Approved ({formatEffort(legendTotals.approved)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
          <span>Submitted ({formatEffort(legendTotals.submitted)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/40" />
          <span>Unsubmitted ({formatEffort(legendTotals.unsubmitted)})</span>
        </div>
      </div>
    </div>
  );
}

interface ProgressDisplayData {
  week: string;
  cumulative: number;
  date: Date;
  isCurrentWeek: boolean;
  monthLabel?: string;
}

/**
 * Generate cumulative hours data for the progress chart
 * Shows all weeks in the range with cumulative totals carrying forward
 */
function generateProgressDisplayData(
  data: WeeklyDataPoint[],
  weeksToShow: number,
  offsetWeeks: number
): ProgressDisplayData[] {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const currentWeekStr = getISOWeek(currentWeekStart);

  // Create a map of week -> cumulative hours from the data
  const cumulativeMap = new Map<string, number>();
  for (const d of data) {
    cumulativeMap.set(d.week, d.cumulative);
  }

  // Calculate the end week (current week minus offset)
  const endWeekDate = new Date(currentWeekStart);
  endWeekDate.setDate(endWeekDate.getDate() - offsetWeeks * 7);

  // Generate weeks array
  const weeks: ProgressDisplayData[] = [];
  let lastMonth = -1;
  let lastKnownCumulative = 0;

  // Sort all data weeks to find cumulative before our display range
  const sortedWeeks = Array.from(cumulativeMap.keys()).sort();

  for (let i = weeksToShow - 1; i >= 0; i--) {
    const weekDate = new Date(endWeekDate);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const weekStr = getISOWeek(weekDate);

    // Find the cumulative value: either from this week's data, or carry forward
    if (cumulativeMap.has(weekStr)) {
      lastKnownCumulative = cumulativeMap.get(weekStr)!;
    } else {
      // Find the most recent cumulative value before this week
      for (const w of sortedWeeks) {
        if (w <= weekStr && cumulativeMap.has(w)) {
          lastKnownCumulative = cumulativeMap.get(w)!;
        }
      }
    }

    // Determine if we should show month label
    const month = weekDate.getMonth();
    let monthLabel: string | undefined;
    if (month !== lastMonth) {
      monthLabel = weekDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      lastMonth = month;
    }

    weeks.push({
      week: weekStr,
      cumulative: lastKnownCumulative,
      date: weekDate,
      isCurrentWeek: weekStr === currentWeekStr,
      monthLabel,
    });
  }

  return weeks;
}

function ProgressLineChart({
  data,
  offsetWeeks,
  hoursSpent,
  hoursPlanned,
  estimateHours,
  billableResourcePrice,
  invoicedPrice,
  unpostedBillable,
  showBillablePrice,
  showTimeBudgeted,
  showTimeSpent,
  onShowCards,
  unit,
  hoursPerDay,
  projectStartDate,
  projectEndDate,
  currencyCode,
}: {
  data: WeeklyDataPoint[];
  offsetWeeks: number;
  hoursSpent: number;
  hoursPlanned: number;
  estimateHours: number;
  billableResourcePrice: number;
  invoicedPrice: number;
  unpostedBillable: number;
  showBillablePrice: boolean;
  showTimeBudgeted: boolean;
  showTimeSpent: boolean;
  // Reveals the given (hidden) KPI cards, which unmasks the chart
  onShowCards: (labels: string[]) => void;
  unit: SpendUnit;
  hoursPerDay: number;
  projectStartDate?: string;
  projectEndDate?: string;
  currencyCode: string;
}) {
  const isCost = unit === 'cost';
  // Which KPI card eyes govern the chart: cost cards for £, time cards for effort
  const showBudget = isCost ? showBillablePrice : showTimeBudgeted;
  const showActual = isCost ? showBillablePrice : showTimeSpent;
  // Y-axis labels plus the spent line would reveal both figures, so only label it when both are visible
  const showValueAxis = showBudget && showActual;
  const formatValue = (value: number) => {
    if (unit === 'cost') return formatCurrencyShort(value, currencyCode);
    const rounded = Math.round(value * 10) / 10;
    return `${rounded.toLocaleString('en-GB')}${unit === 'hours' ? 'h' : 'd'}`;
  };
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const displayData = useMemo(
    () => generateProgressDisplayData(data, WEEKS_TO_SHOW, offsetWeeks),
    [data, offsetWeeks]
  );

  // The budget is the quoted estimate (Billable Resource lines), not the Plan's Budget lines.
  // Falls back to the Plan's hours for projects without an estimate (e.g. internal work).
  const budgetHours = estimateHours > 0 ? estimateHours : hoursPlanned;
  // Selling rate per hour, so £ compares like with like against the Billable Price:
  // posted invoiced price + the service's estimate for unposted hours, over hours spent;
  // before any time is spent, the estimate's own rate.
  const priceRate = useMemo(() => {
    const spentPrice = invoicedPrice + unpostedBillable;
    if (spentPrice > 0 && hoursSpent > 0) return spentPrice / hoursSpent;
    if (billableResourcePrice > 0 && budgetHours > 0) return billableResourcePrice / budgetHours;
    return null;
  }, [invoicedPrice, unpostedBillable, hoursSpent, billableResourcePrice, budgetHours]);
  // Value per hour in the chosen unit; the rest of the chart works in that unit
  const effortRate = unit === 'hours' ? 1 : 1 / (hoursPerDay || 8);
  const avgCostRate = isCost ? priceRate : effortRate;
  // Budget in the chosen unit: Billable Price of the estimate (£) or its time (hours/days)
  const budgetValue = isCost ? billableResourcePrice : budgetHours * effortRate;

  // Forecast cumulative hours for future weeks: hours spent to date plus the planned
  // hours (from Job Planning Lines, i.e. the Plan page) of each week after this one
  const { forecastHoursByWeek, forecastHoursAtCompletion } = useMemo(() => {
    const currentWeek = getISOWeek(getWeekStart(new Date()));
    const byWeek = new Map<string, number>();
    let running = 0;
    for (const d of data) {
      if (d.week <= currentWeek) running = d.cumulative;
      else {
        running += d.plannedHours || 0;
        byWeek.set(d.week, running);
      }
    }
    return { forecastHoursByWeek: byWeek, forecastHoursAtCompletion: running };
  }, [data]);
  // The forecast is spend too, so it's hidden along with Actual Cost
  const hasForecast = showActual && avgCostRate !== null && forecastHoursByWeek.size > 0;
  const forecastAtCompletion = hasForecast ? forecastHoursAtCompletion * avgCostRate : 0;

  // Convert cumulative hours to cumulative cost for display. Future weeks get a
  // forecast cost instead of carrying the spent line flat.
  // If no rate available, set cost to 0 (chart will show hours only).
  // Also 0 when Actual Cost is hidden: the curve's height against the labelled
  // budget line (and the scale it drives) would otherwise reveal the hidden spend.
  const displayDataWithCost = useMemo(() => {
    const currentWeek = getISOWeek(getWeekStart(new Date()));
    const points = [];
    let lastForecastHours: number | null = null;
    for (const d of displayData) {
      const isFuture = d.week > currentWeek;
      const cumulativeCost = showActual && avgCostRate !== null ? d.cumulative * avgCostRate : 0;
      let forecastHours: number | null = null;
      let forecastCost: number | null = null;
      if (showActual && avgCostRate !== null && isFuture) {
        // Weeks with no planning lines carry the latest earlier forecast forward, including
        // from weeks before the visible window (ISO week strings sort correctly as text)
        let carried: number | null = forecastHoursByWeek.get(d.week) ?? lastForecastHours;
        if (carried === null) {
          for (const [week, hours] of forecastHoursByWeek) {
            if (week <= d.week) carried = hours;
          }
        }
        const weekForecastHours: number = carried ?? d.cumulative;
        lastForecastHours = weekForecastHours;
        forecastHours = weekForecastHours;
        forecastCost = weekForecastHours * avgCostRate;
      }
      points.push({ ...d, isFuture, cumulativeCost, forecastHours, forecastCost });
    }
    return points;
  }, [displayData, avgCostRate, forecastHoursByWeek, showActual]);

  // Height used for a point: forecast for future weeks, spent otherwise
  const pointCost = (d: (typeof displayDataWithCost)[number]) =>
    d.isFuture && d.forecastCost !== null ? d.forecastCost : d.cumulativeCost;
  const yFor = (cost: number) => (maxCost > 0 ? (1 - cost / maxCost) * 100 : 100);
  // Each week spans an equal slot with its point at the centre (as in the bar chart)
  const xFor = (index: number) => ((index + 0.5) / displayDataWithCost.length) * 100;

  // Y-axis scale from the whole project (not just the visible weeks), so it stays
  // fixed while scrolling: at least the budget, the highest spend, or the forecast
  const { top: maxCost, ticks: yAxisLabels } = useMemo(() => {
    const maxCumulativeHours = Math.max(...data.map((d) => d.cumulative), 0);
    // Budget-only while Actual Cost is hidden, so the scale can't hint at the hidden spend
    // (forecastAtCompletion is already 0 then)
    const maxCumulativeCost =
      showActual && avgCostRate !== null ? maxCumulativeHours * avgCostRate : 0;
    const max = Math.max(maxCumulativeCost, forecastAtCompletion, budgetValue * 1.1); // Add 10% buffer above budget
    // Minimum axis height: £500, 5 hours or 1 day
    return getNiceScale(max, isCost ? 500 : unit === 'hours' ? 5 : 1);
  }, [data, avgCostRate, forecastAtCompletion, budgetValue, showActual, isCost, unit]);

  // On-track line: straight from 0 on the project start date to the full budget on the end
  // date, so spend above it is ahead of plan and below it is behind. Uses the same equal
  // week slots as the points and Today marker; only the part inside the visible weeks is drawn.
  const onTrack = (() => {
    const start = parseLocalDate(projectStartDate);
    const end = parseLocalDate(projectEndDate);
    if (!start || !end || end <= start || !showBudget || budgetValue <= 0) return null;
    if (displayDataWithCost.length === 0) return null;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const windowStart = displayDataWithCost[0].date.getTime();
    const windowEnd = windowStart + displayDataWithCost.length * weekMs;
    const valueAt = (t: number) =>
      budgetValue *
      Math.min(1, Math.max(0, (t - start.getTime()) / (end.getTime() - start.getTime())));
    const xAt = (t: number) => ((t - windowStart) / weekMs / displayDataWithCost.length) * 100;
    const from = Math.max(start.getTime(), windowStart);
    const to = Math.min(end.getTime(), windowEnd);
    return {
      valueAt,
      segment:
        from < to
          ? { x1: xAt(from), y1: yFor(valueAt(from)), x2: xAt(to), y2: yFor(valueAt(to)) }
          : null,
    };
  })();

  const currentWeekIndex = displayDataWithCost.findIndex((d) => d.isCurrentWeek);

  // Budget line Y position
  const totalBudgetY = maxCost > 0 ? (1 - budgetValue / maxCost) * 100 : 0;

  // Label the forecast where it reaches its final value, if that's in view (not part-way off the edge)
  const completionIndex = hasForecast
    ? displayDataWithCost.findIndex(
        (d) => d.isFuture && d.forecastHours === forecastHoursAtCompletion
      )
    : -1;
  const forecastEnd =
    completionIndex >= 0
      ? {
          x: xFor(completionIndex),
          y: yFor(forecastAtCompletion),
          value: forecastAtCompletion,
        }
      : null;
  // When the forecast ends close to the budget line, both labels share one row on the side
  // of the line away from the forecast's end point, so neither sits on a line or the other
  const forecastNearBudget =
    !!forecastEnd && showBudget && Math.abs(forecastEnd.y - totalBudgetY) < 8;
  const sharedLabelBelowLine = forecastNearBudget && forecastEnd!.y < totalBudgetY;

  // With both the budget and the spend hidden there is nothing left to plot: drawing the
  // chart would give a flat line at zero against a '•••' axis, which looks broken. Say why
  // instead, and offer to reveal the governing cards. Nothing here depends on the figures.
  if (!showBudget && !showActual) {
    const hiddenCards = isCost ? ['Billable Price'] : ['Estimate', 'Time Spent'];
    return (
      <MaskedChartState
        title={isCost ? 'Amounts are hidden' : 'Effort figures are hidden'}
        hiddenCards={hiddenCards}
        actionLabel={isCost ? 'Show amounts' : 'Show figures'}
        onShow={() => onShowCards(hiddenCards)}
      />
    );
  }

  return (
    <div>
      <div className="flex h-48">
        {/* Y-axis - values in the chosen unit */}
        <div className="flex w-12 flex-col justify-between pr-2 text-right text-xs text-gray-500">
          {yAxisLabels.map((label) => (
            <span key={label}>{showValueAxis ? formatValue(label) : '•••'}</span>
          ))}
        </div>

        {/* Chart area */}
        <div className="relative flex-1">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {yAxisLabels.map((label) => (
              <div key={label} className="border-dark-600 border-t" />
            ))}
          </div>

          {/* Estimate band and budget line */}
          {showBudget && budgetValue > 0 && (
            <>
              <div
                className="absolute right-0 bottom-0 left-0 bg-blue-500/10"
                style={{ height: `${100 - totalBudgetY}%` }}
              />

              {/* Total budget line */}
              <div
                className="absolute right-0 left-0 border-t-2 border-dashed border-amber-500/50"
                style={{ top: `${totalBudgetY}%` }}
              >
                <span
                  className={cn(
                    'absolute right-0 text-xs text-amber-400',
                    sharedLabelBelowLine ? 'top-1' : '-top-5'
                  )}
                >
                  Budget: {formatValue(budgetValue)}
                  {forecastNearBudget && forecastEnd && (
                    <span className="text-sky-400">
                      {' '}
                      · Forecast: {formatValue(forecastEnd.value)}
                    </span>
                  )}
                </span>
              </div>
            </>
          )}

          {/* Today marker - each week spans an equal slot (points sit at slot centres) */}
          {currentWeekIndex >= 0 && (
            <TodayMarker
              leftPercent={
                ((currentWeekIndex + getTodayFractionOfWeek()) / displayDataWithCost.length) * 100
              }
            />
          )}

          {/* Line chart with SVG - stretched for line and fill */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Area fill - spent to date only */}
            <path
              d={(() => {
                if (!showActual || displayDataWithCost.length < 2) return '';
                const past = displayDataWithCost.filter((d) => !d.isFuture);
                if (past.length < 2) return '';
                const points = past.map((d, i) => {
                  const x = xFor(i);
                  return `${x},${yFor(d.cumulativeCost)}`;
                });
                return `M ${points.join(' L ')} L ${xFor(past.length - 1)},100 L ${xFor(0)},100 Z`;
              })()}
              fill="currentColor"
              className="text-thyme-500/20"
            />

            {/* Spent line - to date only */}
            <path
              d={(() => {
                if (!showActual || displayDataWithCost.length < 2) return '';
                const points = displayDataWithCost
                  .map((d, i) => ({ d, i }))
                  .filter(({ d }) => !d.isFuture)
                  .map(({ d, i }) => {
                    const x = xFor(i);
                    return `${x},${yFor(d.cumulativeCost)}`;
                  });
                return points.length > 1 ? `M ${points.join(' L ')}` : '';
              })()}
              fill="none"
              stroke="currentColor"
              className="text-thyme-500"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {/* On-track line - grey dotted, start date (0) to end date (budget) */}
            {onTrack?.segment && (
              <line
                x1={onTrack.segment.x1}
                y1={onTrack.segment.y1}
                x2={onTrack.segment.x2}
                y2={onTrack.segment.y2}
                stroke="currentColor"
                className="text-gray-400"
                strokeWidth="1.5"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Forecast line - from this week's spend through future planned hours */}
            <path
              d={(() => {
                if (!hasForecast || displayDataWithCost.length < 2) return '';
                const points = displayDataWithCost
                  .map((d, i) => ({ d, i }))
                  .filter(({ d, i }) => d.isFuture || displayDataWithCost[i + 1]?.isFuture)
                  .map(({ d, i }) => {
                    const x = xFor(i);
                    return `${x},${yFor(pointCost(d))}`;
                  });
                return points.length > 1 ? `M ${points.join(' L ')}` : '';
              })()}
              fill="none"
              stroke="currentColor"
              className="text-sky-400"
              strokeWidth="2"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Forecast label at the end of the forecast line, like the budget line's */}
          {forecastEnd && !forecastNearBudget && (
            <span
              className={cn(
                'absolute -translate-y-full pb-1 text-xs whitespace-nowrap text-sky-400',
                forecastEnd.x > 20 ? '-translate-x-full pr-1' : 'pl-1'
              )}
              style={{ left: `${forecastEnd.x}%`, top: `${forecastEnd.y}%` }}
            >
              Forecast: {formatValue(forecastEnd.value)}
            </span>
          )}

          {/* Points - separate layer to avoid stretching */}
          <div className="absolute inset-0">
            {displayDataWithCost.map((point, i) => {
              const xPercent = xFor(i);
              const yPercent = yFor(pointCost(point));
              const isHovered = hoveredIndex === i;

              return (
                <div
                  key={point.week}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${xPercent}%`,
                    top: `${yPercent}%`,
                  }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Large invisible hover area */}
                  <div className="absolute -inset-3 cursor-pointer" />
                  {/* Visible dot */}
                  <div
                    className={cn(
                      'relative rounded-full',
                      point.isFuture
                        ? 'bg-dark-800 border border-sky-400'
                        : point.isCurrentWeek
                          ? 'bg-thyme-400'
                          : 'bg-thyme-500',
                      isHovered || point.isCurrentWeek ? 'h-3 w-3' : 'h-2 w-2'
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* Tooltip with breakdown */}
          {hoveredIndex !== null && (
            <div
              className="bg-dark-700 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded px-3 py-2 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${xFor(hoveredIndex)}%`,
                top: `${yFor(pointCost(displayDataWithCost[hoveredIndex]))}%`,
                marginTop: '-12px',
              }}
            >
              <div className="font-medium text-white">
                {displayDataWithCost[hoveredIndex].date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <div className="border-dark-500 mt-1 border-t pt-1">
                {/* Hours follow the Time Spent eye in every unit */}
                {showTimeSpent && (
                  <div className="text-gray-400">
                    {(
                      displayDataWithCost[hoveredIndex].forecastHours ??
                      displayDataWithCost[hoveredIndex].cumulative
                    ).toFixed(1)}{' '}
                    hours{displayDataWithCost[hoveredIndex].isFuture ? ' (forecast)' : ''}
                  </div>
                )}
                {showActual &&
                  avgCostRate !== null &&
                  unit !== 'hours' &&
                  (displayDataWithCost[hoveredIndex].isFuture ? (
                    <div className="text-sky-400">
                      ~{formatValue(pointCost(displayDataWithCost[hoveredIndex]))} forecast (incl.
                      planned hours)
                    </div>
                  ) : (
                    <div className="text-thyme-400">
                      ~{formatValue(displayDataWithCost[hoveredIndex].cumulativeCost)} spent
                    </div>
                  ))}
              </div>
              {onTrack && (
                <div className="border-dark-500 mt-1 border-t pt-1 text-gray-400">
                  On track:{' '}
                  {formatValue(onTrack.valueAt(displayDataWithCost[hoveredIndex].date.getTime()))}
                </div>
              )}
              {showBudget && budgetValue > 0 && (
                <div className="border-dark-500 mt-1 border-t pt-1 text-amber-400">
                  Budget: {formatValue(budgetValue)}
                </div>
              )}
              {displayDataWithCost[hoveredIndex].isCurrentWeek && (
                <div className="text-thyme-400 mt-1">This week</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* X-axis with month labels */}
      <div className="mt-2 ml-12 flex">
        {displayDataWithCost.map((point) => (
          <div key={point.week} className="flex-1 text-center">
            {point.monthLabel && <span className="text-xs text-gray-500">{point.monthLabel}</span>}
          </div>
        ))}
      </div>

      {/* Legend */}
      {showBudget && budgetValue > 0 && (
        <div className="mt-2 ml-12 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="bg-thyme-500/50 inline-block h-2 w-4 rounded" />
            <span>Spent</span>
          </div>
          {onTrack && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-dotted border-gray-400" />
              <span>On track</span>
            </div>
          )}
          {hasForecast && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-dashed border-sky-400" />
              <span>Forecast ({formatValue(forecastAtCompletion)} at completion)</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-blue-500/30" />
            <span>Estimate</span>
          </div>
        </div>
      )}
    </div>
  );
}
