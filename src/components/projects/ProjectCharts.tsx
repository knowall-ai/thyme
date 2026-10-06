'use client';

import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn } from '@/utils';
import type { CostBreakdown } from '@/services/bc/projectDetailsService';

// Interval for auto-repeat when holding navigation buttons (ms)
const HOLD_INITIAL_DELAY = 400; // Delay before repeat starts
const HOLD_REPEAT_INTERVAL = 100; // Speed of repeat

type ChartView = 'weekly' | 'progress';

// Units for the Spend vs Budget chart. Effort (hours/days) shows no money, so the chart
// can go in a PDF for a customer without exposing internal costs.
type SpendUnit = 'hours' | 'days' | 'cost';
const SPEND_UNITS: { value: SpendUnit; label: string; title: string }[] = [
  { value: 'hours', label: 'Hours', title: 'Effort in hours against Time Budgeted' },
  { value: 'days', label: 'Days', title: 'Effort in days against Time Budgeted' },
  { value: 'cost', label: '£', title: 'Internal cost against Budget Cost' }, // label replaced by the company currency symbol
];

const WEEKS_TO_SHOW = 24;

// Map currency codes to symbols for compact chart labels
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  CAD: 'CA$',
  AUD: 'A$',
};

// Format currency for chart labels using compact notation
function formatCurrencyShort(amount: number, currencyCode: string): string {
  const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  if (amount >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(1)}k`;
  }
  return `${symbol}${amount.toFixed(0)}`;
}

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

// Chart title shown only in print, where the on-screen view toggle is hidden
function PrintChartTitle({ children }: { children: ReactNode }) {
  return (
    <div className="bg-thyme-600 mb-4 hidden rounded-lg px-4 py-2 text-sm font-medium text-white print:inline-block">
      {children}
    </div>
  );
}

export function ProjectCharts() {
  const { analytics, isLoadingAnalytics, hiddenKpis, currencyCode, project } =
    useProjectDetailsStore();
  // Follow the Budget Cost / Actual Cost KPI card Eye toggles
  const showBudgetCost = !hiddenKpis.includes('Budget Cost');
  const showActualCost = !hiddenKpis.includes('Actual Cost');
  // ...and the Time Budgeted / Time Spent eyes in effort (hours/days) mode
  const showTimeBudgeted = !hiddenKpis.includes('Time Budgeted');
  const showTimeSpent = !hiddenKpis.includes('Time Spent');
  const [chartView, setChartView] = useState<ChartView>('weekly');
  // Days by default: effort is the safe view to share, and matches how projects are planned
  const [spendUnit, setSpendUnit] = useState<SpendUnit>('days');
  // Weeks back from the current week (negative = scrolled into the future)
  const [offsetWeeks, setOffsetWeeks] = useState(0);

  // Furthest forward the charts can scroll: the later of the project end date and the
  // last week with any data (e.g. future planned hours), so upcoming work is visible
  const weeklyData = useMemo(() => analytics?.weeklyData ?? [], [analytics]);
  const projectEndDate = project?.endDate;
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
          {/* Unit toggle for Spend vs Budget: effort (no money) or internal cost */}
          {chartView === 'progress' && (
            <div
              className="border-dark-600 ml-2 flex overflow-hidden rounded-lg border"
              role="group"
              aria-label="Spend vs Budget units"
            >
              {SPEND_UNITS.map((u) => (
                <button
                  key={u.value}
                  onClick={() => setSpendUnit(u.value)}
                  title={u.title}
                  aria-pressed={spendUnit === u.value}
                  className={cn(
                    'px-3 py-2 text-sm font-medium transition-colors',
                    spendUnit === u.value
                      ? 'bg-dark-500 text-white'
                      : 'bg-dark-700 text-gray-400 hover:text-white'
                  )}
                >
                  {u.value === 'cost' ? CURRENCY_SYMBOLS[currencyCode] || currencyCode : u.label}
                </button>
              ))}
            </div>
          )}
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
        <PrintChartTitle>Hours per Week</PrintChartTitle>
        <WeeklyBarChart data={weeklyData} offsetWeeks={offsetWeeks} />
      </div>
      <div className={cn('print:mt-6', chartView !== 'progress' && 'hidden print:block')}>
        <PrintChartTitle>
          {spendUnit === 'cost' ? 'Spend vs Budget' : `Effort vs Budget (${spendUnit})`}
        </PrintChartTitle>
        <ProgressLineChart
          data={weeklyData}
          offsetWeeks={offsetWeeks}
          budgetCost={analytics?.budgetCost ?? 0}
          budgetCostBreakdown={
            analytics?.budgetCostBreakdown ?? { resource: 0, item: 0, glAccount: 0, total: 0 }
          }
          hoursSpent={analytics?.hoursSpent ?? 0}
          hoursPlanned={analytics?.hoursPlanned ?? 0}
          actualCost={analytics?.actualCost ?? 0}
          unpostedCost={analytics?.unpostedCost ?? 0}
          showBudgetCost={showBudgetCost}
          showActualCost={showActualCost}
          showTimeBudgeted={showTimeBudgeted}
          showTimeSpent={showTimeSpent}
          unit={spendUnit}
          hoursPerDay={analytics?.hoursPerDay ?? 8}
          currencyCode={currencyCode}
        />
      </div>
    </Card>
  );
}

interface WeeklyDataPoint {
  week: string;
  hours: number;
  approvedHours: number;
  pendingHours: number;
  plannedHours: number; // Budgeted hours from Job Planning Lines
  cumulative: number;
}

interface WeekDisplayData {
  week: string;
  hours: number;
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open/Submitted timesheets
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
  const ticks = Array.from({ length: steps + 1 }, (_, i) => i * step).reverse();
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
    { hours: number; approvedHours: number; pendingHours: number; plannedHours: number }
  >();
  for (const d of data) {
    dataMap.set(d.week, {
      hours: d.hours,
      approvedHours: d.approvedHours || 0,
      pendingHours: d.pendingHours || 0,
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
}

function WeeklyBarChart({ data, offsetWeeks }: WeeklyBarChartProps) {
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
          pending: acc.pending + d.pendingHours,
        }),
        { planned: 0, approved: 0, pending: 0 }
      ),
    [displayData]
  );

  // Y-axis scale from every week of the project (not just the visible ones),
  // so it stays fixed while scrolling back and forward
  const { top: maxHours, ticks: yAxisLabels } = useMemo(() => {
    // Consider both actual hours and planned hours for the max
    const max = Math.max(...data.map((d) => Math.max(d.hours, d.plannedHours || 0)), 0);
    return getNiceScale(max, 5);
  }, [data]);

  const currentWeekIndex = displayData.findIndex((d) => d.isCurrentWeek);

  return (
    <div>
      <div className="flex h-48">
        {/* Y-axis */}
        <div className="flex w-8 flex-col justify-between pr-2 text-right text-xs text-gray-500">
          {yAxisLabels.map((label) => (
            <span key={label}>{label}</span>
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
              // Stacked bar heights: approved at bottom, pending on top
              const approvedHeightPercent =
                maxHours > 0 ? (point.approvedHours / maxHours) * 100 : 0;
              const pendingHeightPercent = maxHours > 0 ? (point.pendingHours / maxHours) * 100 : 0;
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
                      {/* Pending hours (top of stack - amber/orange) */}
                      {pendingHeightPercent > 0 && (
                        <div
                          className={cn(
                            'w-full transition-all',
                            point.isCurrentWeek
                              ? 'bg-amber-400'
                              : 'bg-amber-500 group-hover:bg-amber-400',
                            approvedHeightPercent === 0 && 'rounded-t'
                          )}
                          style={{
                            height: `${pendingHeightPercent}%`,
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
                          Planned: {point.plannedHours.toFixed(1)}h
                        </div>
                      )}
                      {point.approvedHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="bg-thyme-500 inline-block h-2 w-2 rounded-sm" />
                          Approved: {point.approvedHours.toFixed(1)}h
                        </div>
                      )}
                      {point.pendingHours > 0 && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
                          Pending: {point.pendingHours.toFixed(1)}h
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
      <div className="mt-2 ml-8 flex">
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
          <span>Planned ({legendTotals.planned.toFixed(1)}h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-thyme-500 inline-block h-2.5 w-2.5 rounded-sm" />
          <span>Approved ({legendTotals.approved.toFixed(1)}h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
          <span>Pending ({legendTotals.pending.toFixed(1)}h)</span>
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
  budgetCost,
  budgetCostBreakdown,
  hoursSpent,
  hoursPlanned,
  actualCost,
  unpostedCost,
  showBudgetCost,
  showActualCost,
  showTimeBudgeted,
  showTimeSpent,
  unit,
  hoursPerDay,
  currencyCode,
}: {
  data: WeeklyDataPoint[];
  offsetWeeks: number;
  budgetCost: number;
  budgetCostBreakdown: CostBreakdown;
  hoursSpent: number;
  hoursPlanned: number;
  actualCost: number;
  unpostedCost: number;
  showBudgetCost: boolean;
  showActualCost: boolean;
  showTimeBudgeted: boolean;
  showTimeSpent: boolean;
  unit: SpendUnit;
  hoursPerDay: number;
  currencyCode: string;
}) {
  const isCost = unit === 'cost';
  // Which KPI card eyes govern the chart: cost cards for £, time cards for effort
  const showBudget = isCost ? showBudgetCost : showTimeBudgeted;
  const showActual = isCost ? showActualCost : showTimeSpent;
  // Y-axis labels plus the spent line would reveal both figures, so only label it when both are visible
  const showValueAxis = showBudget && showActual;
  const formatValue = (value: number) => {
    if (unit === 'cost') return formatCurrencyShort(value, currencyCode);
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded.toLocaleString('en-GB')}${unit === 'hours' ? 'h' : 'd'}`;
  };
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const displayData = useMemo(
    () => generateProgressDisplayData(data, WEEKS_TO_SHOW, offsetWeeks),
    [data, offsetWeeks]
  );

  // Average cost per hour. Spent = posted cost + the service's estimate for unposted
  // hours (at posted rates, or budget rates when nothing is posted yet), so the line
  // rises as timesheets are entered rather than only once they're posted to BC.
  // Before any time is spent, fall back to the budget resource rate for the forecast.
  const costRate = useMemo(() => {
    const spentCost = actualCost + unpostedCost;
    if (spentCost > 0 && hoursSpent > 0) return spentCost / hoursSpent;
    if (budgetCostBreakdown.resource > 0 && hoursPlanned > 0) {
      return budgetCostBreakdown.resource / hoursPlanned;
    }
    return null;
  }, [actualCost, unpostedCost, hoursSpent, budgetCostBreakdown.resource, hoursPlanned]);
  // Value per hour in the chosen unit; the rest of the chart works in that unit
  const effortRate = unit === 'hours' ? 1 : 1 / (hoursPerDay || 8);
  const avgCostRate = isCost ? costRate : effortRate;
  // Budget in the chosen unit: Budget Cost (£) or Time Budgeted (hours/days)
  const budgetValue = isCost ? budgetCost : hoursPlanned * effortRate;

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

  const currentWeekIndex = displayDataWithCost.findIndex((d) => d.isCurrentWeek);

  // Budget breakdown line Y positions
  const resourceBudgetY = maxCost > 0 ? (1 - budgetCostBreakdown.resource / maxCost) * 100 : 100;
  const resourceItemBudgetY =
    maxCost > 0
      ? (1 - (budgetCostBreakdown.resource + budgetCostBreakdown.item) / maxCost) * 100
      : 100;
  const totalBudgetY = maxCost > 0 ? (1 - budgetValue / maxCost) * 100 : 0;

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

          {/* Budget breakdown bands (£ only) and total budget line */}
          {showBudget && budgetValue > 0 && (
            <>
              {/* Effort: budgeted time is all resource time, so one band up to the budget */}
              {!isCost && (
                <div
                  className="absolute right-0 bottom-0 left-0 bg-blue-500/10"
                  style={{ height: `${100 - totalBudgetY}%` }}
                />
              )}
              {/* Resource budget band (bottom) */}
              {isCost && budgetCostBreakdown.resource > 0 && (
                <div
                  className="absolute right-0 bottom-0 left-0 bg-blue-500/10"
                  style={{ height: `${100 - resourceBudgetY}%` }}
                />
              )}
              {/* Item budget band (middle) */}
              {isCost && budgetCostBreakdown.item > 0 && (
                <div
                  className="absolute right-0 left-0 bg-purple-500/10"
                  style={{
                    top: `${resourceItemBudgetY}%`,
                    height: `${resourceBudgetY - resourceItemBudgetY}%`,
                  }}
                />
              )}
              {/* G/L Account budget band (top) */}
              {isCost && budgetCostBreakdown.glAccount > 0 && (
                <div
                  className="absolute right-0 left-0 bg-amber-500/10"
                  style={{
                    top: `${totalBudgetY}%`,
                    height: `${resourceItemBudgetY - totalBudgetY}%`,
                  }}
                />
              )}

              {/* Total budget line */}
              <div
                className="absolute right-0 left-0 border-t-2 border-dashed border-amber-500/50"
                style={{ top: `${totalBudgetY}%` }}
              >
                <span className="absolute -top-5 right-0 text-xs text-amber-400">
                  Budget: {formatValue(budgetValue)}
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
          {hoveredIndex !== null && (showBudget || showActual) && (
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
              {showBudget && budgetValue > 0 && !isCost && (
                <div className="border-dark-500 mt-1 border-t pt-1 text-amber-400">
                  Budget: {formatValue(budgetValue)}
                </div>
              )}
              {showBudget && isCost && budgetCost > 0 && (
                <div className="border-dark-500 mt-1 border-t pt-1">
                  <div className="mb-1 text-gray-500">Budget breakdown:</div>
                  {budgetCostBreakdown.resource > 0 && (
                    <div className="flex items-center gap-2 text-blue-400">
                      <span className="inline-block h-2 w-2 rounded-sm bg-blue-500/50" />
                      Resource: {formatCurrencyShort(budgetCostBreakdown.resource, currencyCode)}
                    </div>
                  )}
                  {budgetCostBreakdown.item > 0 && (
                    <div className="flex items-center gap-2 text-purple-400">
                      <span className="inline-block h-2 w-2 rounded-sm bg-purple-500/50" />
                      Item: {formatCurrencyShort(budgetCostBreakdown.item, currencyCode)}
                    </div>
                  )}
                  {budgetCostBreakdown.glAccount > 0 && (
                    <div className="flex items-center gap-2 text-amber-400">
                      <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/50" />
                      G/L Account:{' '}
                      {formatCurrencyShort(budgetCostBreakdown.glAccount, currencyCode)}
                    </div>
                  )}
                  <div className="mt-1 font-medium text-amber-400">
                    Total: {formatCurrencyShort(budgetCost, currencyCode)}
                  </div>
                </div>
              )}
              {displayDataWithCost[hoveredIndex].isCurrentWeek && (
                <div className="text-thyme-400 mt-1">This week</div>
              )}
            </div>
          )}

          {/* Simple tooltip when costs are hidden */}
          {hoveredIndex !== null && !showBudget && !showActual && (
            <div
              className="bg-dark-700 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${xFor(hoveredIndex)}%`,
                top: `${yFor(pointCost(displayDataWithCost[hoveredIndex]))}%`,
                marginTop: '-8px',
              }}
            >
              <div className="font-medium text-white">
                {displayDataWithCost[hoveredIndex].date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              {showTimeSpent && (
                <div className="text-gray-400">
                  {displayDataWithCost[hoveredIndex].cumulative.toFixed(1)} hours
                </div>
              )}
              {displayDataWithCost[hoveredIndex].isCurrentWeek && (
                <div className="text-thyme-400">This week</div>
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
          {hasForecast && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-dashed border-sky-400" />
              <span>Forecast ({formatValue(forecastAtCompletion)} at completion)</span>
            </div>
          )}
          {!isCost && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-blue-500/30" />
              <span>Budgeted time</span>
            </div>
          )}
          {isCost && budgetCostBreakdown.resource > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-blue-500/30" />
              <span>Resource</span>
            </div>
          )}
          {isCost && budgetCostBreakdown.item > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-purple-500/30" />
              <span>Item</span>
            </div>
          )}
          {isCost && budgetCostBreakdown.glAccount > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-amber-500/30" />
              <span>G/L Acct</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
