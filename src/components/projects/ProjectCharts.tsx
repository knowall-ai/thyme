'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn } from '@/utils';
import type { CostBreakdown } from '@/services/bc/projectDetailsService';

// Interval for auto-repeat when holding navigation buttons (ms)
const HOLD_INITIAL_DELAY = 400; // Delay before repeat starts
const HOLD_REPEAT_INTERVAL = 100; // Speed of repeat

type ChartView = 'weekly' | 'progress';

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

export function ProjectCharts() {
  const { analytics, isLoadingAnalytics, showCosts, currencyCode } = useProjectDetailsStore();
  const [chartView, setChartView] = useState<ChartView>('weekly');
  const [offsetWeeks, setOffsetWeeks] = useState(0);

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
    setOffsetWeeks((o) => Math.max(0, o - 1));

    // Start repeating after initial delay
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        setOffsetWeeks((o) => Math.max(0, o - 1));
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

  const weeklyData = analytics?.weeklyData ?? [];
  const canGoBack = weeklyData.length > 0;
  const canGoForward = offsetWeeks > 0;

  return (
    <Card variant="bordered" className="p-6">
      {/* Header with toggle and navigation */}
      <div className="mb-6 flex items-center justify-between">
        {/* Chart view toggle - interactive on screen, static label in print */}
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
        </div>
        {/* Static label for print */}
        <div className="bg-thyme-600 hidden rounded-lg px-4 py-2 text-sm font-medium text-white print:block">
          {chartView === 'weekly' ? 'Hours per Week' : 'Spend vs Budget'}
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

      {/* Chart area */}
      {chartView === 'weekly' ? (
        <WeeklyBarChart data={weeklyData} offsetWeeks={offsetWeeks} />
      ) : (
        <ProgressLineChart
          data={weeklyData}
          offsetWeeks={offsetWeeks}
          budgetCost={analytics?.budgetCost ?? 0}
          budgetCostBreakdown={
            analytics?.budgetCostBreakdown ?? { resource: 0, item: 0, glAccount: 0, total: 0 }
          }
          hoursSpent={analytics?.hoursSpent ?? 0}
          actualCost={analytics?.actualCost ?? 0}
          showCosts={showCosts}
          currencyCode={currencyCode}
        />
      )}
    </Card>
  );
}

interface WeeklyDataPoint {
  week: string;
  hours: number;
  approvedHours: number;
  pendingHours: number;
  cumulative: number;
}

interface WeekDisplayData {
  week: string;
  hours: number;
  approvedHours: number; // Hours from Approved timesheets
  pendingHours: number; // Hours from Open/Submitted timesheets
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
  const dataMap = new Map<string, { hours: number; approvedHours: number; pendingHours: number }>();
  for (const d of data) {
    dataMap.set(d.week, {
      hours: d.hours,
      approvedHours: d.approvedHours || 0,
      pendingHours: d.pendingHours || 0,
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
    const weekData = dataMap.get(weekStr) ?? { hours: 0, approvedHours: 0, pendingHours: 0 };

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

  const maxHours = useMemo(() => {
    const max = Math.max(...displayData.map((d) => d.hours), 0);
    // Round up to nice number for Y-axis
    if (max <= 5) return 5;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 40) return 40;
    return Math.ceil(max / 10) * 10;
  }, [displayData]);

  // Generate Y-axis labels
  const yAxisLabels = useMemo(() => {
    const labels = [];
    const step = maxHours <= 10 ? 2 : maxHours <= 20 ? 5 : 10;
    for (let i = 0; i <= maxHours; i += step) {
      labels.push(i);
    }
    return labels.reverse();
  }, [maxHours]);

  return (
    <div className="h-64">
      <div className="flex h-52">
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

          {/* Bars */}
          <div className="relative flex h-full items-end">
            {displayData.map((point) => {
              // Stacked bar heights: approved at bottom, pending on top
              const approvedHeightPercent =
                maxHours > 0 ? (point.approvedHours / maxHours) * 100 : 0;
              const pendingHeightPercent = maxHours > 0 ? (point.pendingHours / maxHours) * 100 : 0;
              const isHovered = hoveredWeek === point.week;

              return (
                <div
                  key={point.week}
                  className="group relative flex h-full flex-1 flex-col items-center"
                  onMouseEnter={() => setHoveredWeek(point.week)}
                  onMouseLeave={() => setHoveredWeek(null)}
                >
                  {/* Bar container - stacked bars (approved + pending) */}
                  <div className="flex h-full w-full items-end justify-center px-0.5">
                    {/* Stacked actual hours bar (approved bottom, pending top) */}
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
                      {/* Pending hours (top of stack - amber) */}
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
                    <div className="bg-dark-700 absolute -top-20 left-1/2 z-10 -translate-x-1/2 rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                      <div className="font-medium text-white">
                        {point.date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
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
                      {point.hours === 0 && <div className="text-gray-400">No hours</div>}
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
  actualCost,
  showCosts,
  currencyCode,
}: {
  data: WeeklyDataPoint[];
  offsetWeeks: number;
  budgetCost: number;
  budgetCostBreakdown: CostBreakdown;
  hoursSpent: number;
  actualCost: number;
  showCosts: boolean;
  currencyCode: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const displayData = useMemo(
    () => generateProgressDisplayData(data, WEEKS_TO_SHOW, offsetWeeks),
    [data, offsetWeeks]
  );

  // Calculate average cost rate from actual posted timesheet data only
  // If no actual cost data exists, cost estimation is skipped entirely
  const avgCostRate = useMemo(() => {
    if (actualCost > 0 && hoursSpent > 0) {
      return actualCost / hoursSpent;
    }
    return null;
  }, [actualCost, hoursSpent]);

  // Convert cumulative hours to cumulative cost for display
  // If no rate available, set cost to 0 (chart will show hours only)
  const displayDataWithCost = useMemo(() => {
    return displayData.map((d) => ({
      ...d,
      cumulativeCost: avgCostRate !== null ? d.cumulative * avgCostRate : 0,
    }));
  }, [displayData, avgCostRate]);

  const maxCost = useMemo(() => {
    // Max should be at least the budget, or the max cumulative cost
    const maxCumulativeCost = Math.max(...displayDataWithCost.map((d) => d.cumulativeCost), 0);
    const max = Math.max(maxCumulativeCost, budgetCost * 1.1); // Add 10% buffer above budget
    // Round up to nice number for Y-axis
    if (max <= 500) return 500;
    if (max <= 1000) return 1000;
    if (max <= 2000) return 2000;
    if (max <= 5000) return 5000;
    return Math.ceil(max / 1000) * 1000;
  }, [displayDataWithCost, budgetCost]);

  // Generate Y-axis labels in £
  const yAxisLabels = useMemo(() => {
    const labels = [];
    const step = maxCost <= 1000 ? 200 : maxCost <= 2000 ? 500 : 1000;
    for (let i = 0; i <= maxCost; i += step) {
      labels.push(i);
    }
    return labels.reverse();
  }, [maxCost]);

  // Budget breakdown line Y positions
  const resourceBudgetY = maxCost > 0 ? (1 - budgetCostBreakdown.resource / maxCost) * 100 : 100;
  const resourceItemBudgetY =
    maxCost > 0
      ? (1 - (budgetCostBreakdown.resource + budgetCostBreakdown.item) / maxCost) * 100
      : 100;
  const totalBudgetY = maxCost > 0 ? (1 - budgetCost / maxCost) * 100 : 0;

  return (
    <div className="h-64">
      <div className="flex h-52">
        {/* Y-axis - £ values */}
        <div className="flex w-12 flex-col justify-between pr-2 text-right text-xs text-gray-500">
          {yAxisLabels.map((label) => (
            <span key={label}>{showCosts ? formatCurrencyShort(label, currencyCode) : '•••'}</span>
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

          {/* Budget breakdown bands (stacked from bottom) */}
          {showCosts && budgetCost > 0 && (
            <>
              {/* Resource budget band (bottom) */}
              {budgetCostBreakdown.resource > 0 && (
                <div
                  className="absolute right-0 bottom-0 left-0 bg-blue-500/10"
                  style={{ height: `${100 - resourceBudgetY}%` }}
                />
              )}
              {/* Item budget band (middle) */}
              {budgetCostBreakdown.item > 0 && (
                <div
                  className="absolute right-0 left-0 bg-purple-500/10"
                  style={{
                    top: `${resourceItemBudgetY}%`,
                    height: `${resourceBudgetY - resourceItemBudgetY}%`,
                  }}
                />
              )}
              {/* G/L Account budget band (top) */}
              {budgetCostBreakdown.glAccount > 0 && (
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
                  Budget: {formatCurrencyShort(budgetCost, currencyCode)}
                </span>
              </div>
            </>
          )}

          {/* Line chart with SVG - stretched for line and fill */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Area fill */}
            <path
              d={(() => {
                if (displayDataWithCost.length < 2) return '';
                const points = displayDataWithCost.map((d, i) => {
                  const x = (i / (displayDataWithCost.length - 1)) * 100;
                  const y = maxCost > 0 ? (1 - d.cumulativeCost / maxCost) * 100 : 100;
                  return `${x},${y}`;
                });
                return `M ${points.join(' L ')} L 100,100 L 0,100 Z`;
              })()}
              fill="currentColor"
              className="text-thyme-500/20"
            />

            {/* Line */}
            <path
              d={(() => {
                if (displayDataWithCost.length < 2) return '';
                const points = displayDataWithCost.map((d, i) => {
                  const x = (i / (displayDataWithCost.length - 1)) * 100;
                  const y = maxCost > 0 ? (1 - d.cumulativeCost / maxCost) * 100 : 100;
                  return `${x},${y}`;
                });
                return `M ${points.join(' L ')}`;
              })()}
              fill="none"
              stroke="currentColor"
              className="text-thyme-500"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Points - separate layer to avoid stretching */}
          <div className="absolute inset-0">
            {displayDataWithCost.map((point, i) => {
              const xPercent = (i / (displayDataWithCost.length - 1)) * 100;
              const yPercent = maxCost > 0 ? (1 - point.cumulativeCost / maxCost) * 100 : 100;
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
                      point.isCurrentWeek ? 'bg-thyme-400' : 'bg-thyme-500',
                      isHovered || point.isCurrentWeek ? 'h-3 w-3' : 'h-2 w-2'
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* Tooltip with breakdown */}
          {hoveredIndex !== null && showCosts && (
            <div
              className="bg-dark-700 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded px-3 py-2 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${(hoveredIndex / (displayDataWithCost.length - 1)) * 100}%`,
                top: `${maxCost > 0 ? (1 - displayDataWithCost[hoveredIndex].cumulativeCost / maxCost) * 100 : 100}%`,
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
                <div className="text-gray-400">
                  {displayDataWithCost[hoveredIndex].cumulative.toFixed(1)} hours
                </div>
                {avgCostRate !== null && (
                  <div className="text-thyme-400">
                    ~
                    {formatCurrencyShort(
                      displayDataWithCost[hoveredIndex].cumulativeCost,
                      currencyCode
                    )}{' '}
                    spent
                  </div>
                )}
              </div>
              {budgetCost > 0 && (
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
          {hoveredIndex !== null && !showCosts && (
            <div
              className="bg-dark-700 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg"
              style={{
                left: `${(hoveredIndex / (displayDataWithCost.length - 1)) * 100}%`,
                top: `${maxCost > 0 ? (1 - displayDataWithCost[hoveredIndex].cumulativeCost / maxCost) * 100 : 100}%`,
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
              <div className="text-gray-400">
                {displayDataWithCost[hoveredIndex].cumulative.toFixed(1)} hours
              </div>
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
      {showCosts && budgetCost > 0 && (
        <div className="mt-2 ml-12 flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="bg-thyme-500/50 inline-block h-2 w-4 rounded" />
            <span>Spent</span>
          </div>
          {budgetCostBreakdown.resource > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-blue-500/30" />
              <span>Resource</span>
            </div>
          )}
          {budgetCostBreakdown.item > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-purple-500/30" />
              <span>Item</span>
            </div>
          )}
          {budgetCostBreakdown.glAccount > 0 && (
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
