'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { useProjectsStore } from '@/hooks';
import { bcClient } from '@/services/bc/bcClient';
import type { BCJobPlanningLine } from '@/types';
import { format, eachDayOfInterval } from 'date-fns';

const DAILY_CAPACITY = 8;

interface ResourceWorkloadProps {
  resourceNo: string;
  weekStart: Date;
  weekEnd: Date;
  excludeJobNo?: string;
  excludeJobTaskNo?: string;
  /** Current form hours (date key → string value) to reflect in bars live */
  currentDayHours?: Record<string, string>;
}

interface DayAllocation {
  date: string;
  hours: number;
}

interface ProjectAllocation {
  jobNo: string;
  projectName: string;
  days: Record<string, number>;
  total: number;
}

export function ResourceWorkload({
  resourceNo,
  weekStart,
  weekEnd,
  excludeJobNo,
  excludeJobTaskNo,
  currentDayHours,
}: ResourceWorkloadProps) {
  const { projects } = useProjectsStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lines, setLines] = useState<BCJobPlanningLine[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  const dateKeys = useMemo(() => weekDays.map((d) => format(d, 'yyyy-MM-dd')), [weekDays]);

  // Load data when expanded (auto-loads on mount since expanded by default)
  const loadWorkload = useCallback(async () => {
    if (hasLoaded || !resourceNo) return;

    setIsLoading(true);
    try {
      const data = await bcClient.getResourceWorkloadForWeek({
        resourceNo,
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      });
      setLines(data);
      setHasLoaded(true);
    } catch (error) {
      console.error('Error loading resource workload:', error);
    } finally {
      setIsLoading(false);
    }
  }, [hasLoaded, resourceNo, weekStart, weekEnd]);

  // Reset and reload when resource or week changes
  useEffect(() => {
    setHasLoaded(false);
    setLines([]);
    setIsExpanded(true);
  }, [resourceNo, weekStart, weekEnd]);

  // Auto-load data (expanded by default)
  useEffect(() => {
    if (isExpanded && !hasLoaded) {
      loadWorkload();
    }
  }, [isExpanded, hasLoaded, loadWorkload]);

  // Filter out current project/task lines
  const filteredLines = useMemo(() => {
    if (!excludeJobNo) return lines;
    return lines.filter((line) => {
      if (excludeJobTaskNo) {
        return !(line.jobNo === excludeJobNo && line.jobTaskNo === excludeJobTaskNo);
      }
      return line.jobNo !== excludeJobNo;
    });
  }, [lines, excludeJobNo, excludeJobTaskNo]);

  // Aggregate hours per day
  const dailyAllocations: DayAllocation[] = useMemo(() => {
    return dateKeys.map((date) => {
      const hours = filteredLines
        .filter((l) => l.planningDate === date)
        .reduce((sum, l) => sum + l.quantity, 0);
      return { date, hours };
    });
  }, [dateKeys, filteredLines]);

  // Combined total per day (other workload + current form hours)
  const combinedDailyHours: DayAllocation[] = useMemo(() => {
    return dailyAllocations.map((alloc) => {
      const formVal = parseFloat(currentDayHours?.[alloc.date] || '0');
      const formHours = isNaN(formVal) ? 0 : formVal;
      return { date: alloc.date, hours: alloc.hours + formHours };
    });
  }, [dailyAllocations, currentDayHours]);

  // Weekly total of other allocations
  const weeklyTotal = useMemo(
    () => dailyAllocations.reduce((sum, d) => sum + d.hours, 0),
    [dailyAllocations]
  );

  // Project breakdown
  const projectBreakdown: ProjectAllocation[] = useMemo(() => {
    const map = new Map<string, ProjectAllocation>();

    for (const line of filteredLines) {
      const key = line.jobNo;
      if (!map.has(key)) {
        const project = projects.find((p) => p.code === line.jobNo);
        map.set(key, {
          jobNo: line.jobNo,
          projectName: project?.name || line.jobNo,
          days: {},
          total: 0,
        });
      }
      const entry = map.get(key)!;
      entry.days[line.planningDate] = (entry.days[line.planningDate] || 0) + line.quantity;
      entry.total += line.quantity;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredLines, projects]);

  // Color for capacity bar
  const getBarColor = (hours: number) => {
    const pct = hours / DAILY_CAPACITY;
    if (pct > 1) return 'bg-red-500';
    if (pct > 0.75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="border-dark-700 rounded border">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={handleToggle}
        className="hover:bg-dark-700/50 flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDownIcon className="text-dark-400 h-4 w-4" />
          ) : (
            <ChevronRightIcon className="text-dark-400 h-4 w-4" />
          )}
          <span className="text-dark-300 text-xs font-medium">Other Workload</span>
        </div>
        {hasLoaded && (
          <span className="text-dark-400 text-xs">
            {weeklyTotal.toFixed(1)}h / {DAILY_CAPACITY * 5}h this business week
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-dark-700 space-y-3 border-t px-3 pt-2 pb-3">
          {isLoading && <p className="text-dark-400 text-xs">Loading workload...</p>}

          {!isLoading && hasLoaded && filteredLines.length === 0 && (
            <p className="text-dark-500 text-xs">No other allocations this week.</p>
          )}

          {!isLoading && hasLoaded && filteredLines.length > 0 && (
            <>
              {/* Capacity bars (combined: other workload + current form) */}
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((day, i) => {
                  const otherHours = dailyAllocations[i].hours;
                  const combined = combinedDailyHours[i];
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const otherPct = Math.min((otherHours / DAILY_CAPACITY) * 100, 100);
                  const formHours = combined.hours - otherHours;
                  const formPct =
                    formHours > 0
                      ? Math.min((formHours / DAILY_CAPACITY) * 100, 100 - otherPct)
                      : 0;

                  return (
                    <div key={combined.date} className="flex flex-col items-center">
                      <span
                        className={cn(
                          'mb-1 text-xs',
                          isWeekend ? 'text-dark-500' : 'text-dark-400'
                        )}
                      >
                        {format(day, 'EEE')}
                      </span>
                      {/* Bar container */}
                      <div className="bg-dark-700 relative h-12 w-full overflow-hidden rounded">
                        {/* Other workload (bottom portion) */}
                        {otherHours > 0 && (
                          <div
                            className={cn(
                              'absolute bottom-0 w-full transition-all',
                              getBarColor(combined.hours)
                            )}
                            style={{ height: `${otherPct}%` }}
                          />
                        )}
                        {/* Current form hours (stacked on top, distinct color) */}
                        {formHours > 0 && (
                          <div
                            className="absolute w-full bg-blue-400 transition-all"
                            style={{ bottom: `${otherPct}%`, height: `${formPct}%` }}
                          />
                        )}
                      </div>
                      {/* Hours label (shows combined total) */}
                      <span
                        className={cn(
                          'mt-1 text-xs',
                          combined.hours > DAILY_CAPACITY
                            ? 'font-medium text-red-400'
                            : 'text-dark-400'
                        )}
                      >
                        {combined.hours > 0 ? `${combined.hours.toFixed(1)}h` : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Project breakdown table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-dark-500">
                      <th className="py-1 text-left font-medium">Project</th>
                      {weekDays.map((day) => (
                        <th
                          key={format(day, 'yyyy-MM-dd')}
                          className="w-8 py-1 text-right font-medium"
                        >
                          {format(day, 'EEE')[0]}
                        </th>
                      ))}
                      <th className="w-10 py-1 text-right font-medium">Tot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectBreakdown.map((proj) => (
                      <tr key={proj.jobNo} className="text-dark-300">
                        <td className="max-w-[120px] truncate py-0.5" title={proj.projectName}>
                          {proj.projectName}
                        </td>
                        {dateKeys.map((date) => (
                          <td key={date} className="py-0.5 text-right">
                            {proj.days[date] ? proj.days[date].toFixed(1) : '-'}
                          </td>
                        ))}
                        <td className="text-dark-200 py-0.5 text-right font-medium">
                          {proj.total.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Available capacity footer (accounts for current form hours) */}
              <div className="border-dark-700 grid grid-cols-7 gap-1 border-t pt-2">
                {weekDays.map((day, i) => {
                  const combined = combinedDailyHours[i];
                  const available = DAILY_CAPACITY - combined.hours;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                  return (
                    <div key={combined.date} className="flex flex-col items-center">
                      <span
                        className={cn(
                          'text-xs',
                          isWeekend
                            ? 'text-dark-500'
                            : available < 0
                              ? 'font-medium text-red-400'
                              : available === 0
                                ? 'text-dark-500'
                                : 'text-emerald-400'
                        )}
                      >
                        {isWeekend ? '-' : `${available.toFixed(1)}h`}
                      </span>
                      <span className="text-dark-500 text-[10px]">avail</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
