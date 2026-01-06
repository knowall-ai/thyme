'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils';
import type { Project, TimeEntry } from '@/types';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  subMonths,
  addMonths,
} from 'date-fns';

interface ProjectTimeChartProps {
  project: Project;
  timeEntries: TimeEntry[];
}

type ViewMode = 'progress' | 'hours';

export function ProjectTimeChart({ project, timeEntries }: ProjectTimeChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('progress');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate date range for chart (6 months view)
  const startDate = useMemo(
    () => subMonths(startOfWeek(currentDate, { weekStartsOn: 1 }), 3),
    [currentDate]
  );
  const endDate = useMemo(
    () => addMonths(endOfWeek(currentDate, { weekStartsOn: 1 }), 3),
    [currentDate]
  );

  // Get weeks in range
  const weeks = useMemo(() => {
    return eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
  }, [startDate, endDate]);

  // Calculate hours per week
  const weeklyData = useMemo(() => {
    const data: { week: Date; hours: number; cumulativeHours: number }[] = [];
    let cumulative = 0;

    weeks.forEach((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekEntries = timeEntries.filter((entry) => {
        const entryDate = parseISO(entry.date);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });
      const hours = weekEntries.reduce((sum, entry) => sum + entry.hours, 0);
      cumulative += hours;
      data.push({ week: weekStart, hours, cumulativeHours: cumulative });
    });

    return data;
  }, [weeks, timeEntries]);

  // Mock budget line
  const budgetHours = 100;
  const maxHours = Math.max(budgetHours, ...weeklyData.map((d) => d.cumulativeHours));

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => (direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  const goToCurrentWeek = () => {
    setCurrentDate(new Date());
  };

  return (
    <Card variant="bordered">
      <CardHeader className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('progress')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'progress' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
            )}
          >
            Project progress
          </button>
          <button
            onClick={() => setViewMode('hours')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'hours' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
            )}
          >
            Hours per week
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth('prev')}
            className="rounded p-1 text-dark-400 hover:bg-dark-700 hover:text-white"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={goToCurrentWeek}
            className="rounded px-3 py-1 text-sm text-dark-400 hover:bg-dark-700 hover:text-white"
          >
            This week
          </button>
          <button
            onClick={() => navigateMonth('next')}
            className="rounded p-1 text-dark-400 hover:bg-dark-700 hover:text-white"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Y-axis labels */}
        <div className="relative h-64">
          <div className="absolute inset-y-0 left-0 flex w-12 flex-col justify-between text-right text-xs text-dark-400">
            <span>{maxHours}h</span>
            <span>{Math.round(maxHours * 0.75)}h</span>
            <span>{Math.round(maxHours * 0.5)}h</span>
            <span>{Math.round(maxHours * 0.25)}h</span>
            <span>0h</span>
          </div>

          {/* Chart area */}
          <div className="ml-14 h-full">
            {/* Grid lines */}
            <div className="absolute inset-0 ml-14 flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="border-t border-dark-700" />
              ))}
            </div>

            {/* Budget line */}
            {viewMode === 'progress' && (
              <div
                className="absolute left-14 right-0 border-t-2 border-dashed border-thyme-500"
                style={{ top: `${(1 - budgetHours / maxHours) * 100}%` }}
              >
                <span className="absolute -top-5 left-0 rounded bg-thyme-500/20 px-2 py-0.5 text-xs text-thyme-400">
                  Budget: {budgetHours}h
                </span>
              </div>
            )}

            {/* Data visualization */}
            <svg className="h-full w-full" preserveAspectRatio="none">
              {viewMode === 'progress' ? (
                // Cumulative line chart
                <g>
                  <polyline
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    points={weeklyData
                      .map((d, i) => {
                        const x = (i / (weeklyData.length - 1)) * 100;
                        const y = (1 - d.cumulativeHours / maxHours) * 100;
                        return `${x}%,${y}%`;
                      })
                      .join(' ')}
                  />
                  {weeklyData.map((d, i) => {
                    const x = (i / (weeklyData.length - 1)) * 100;
                    const y = (1 - d.cumulativeHours / maxHours) * 100;
                    return (
                      <circle
                        key={i}
                        cx={`${x}%`}
                        cy={`${y}%`}
                        r="4"
                        fill="#1f2937"
                        stroke="#22c55e"
                        strokeWidth="2"
                      />
                    );
                  })}
                </g>
              ) : (
                // Bar chart for hours per week
                <g>
                  {weeklyData.map((d, i) => {
                    const barWidth = 100 / weeklyData.length;
                    const x = i * barWidth + barWidth * 0.1;
                    const width = barWidth * 0.8;
                    const height = (d.hours / maxHours) * 100;
                    const y = 100 - height;
                    return (
                      <rect
                        key={i}
                        x={`${x}%`}
                        y={`${y}%`}
                        width={`${width}%`}
                        height={`${height}%`}
                        fill="#22c55e"
                        rx="2"
                      />
                    );
                  })}
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* X-axis labels (months) */}
        <div className="ml-14 mt-2 flex justify-between text-xs text-dark-400">
          {weeks
            .filter((_, i) => i % 4 === 0)
            .map((week, i) => (
              <span key={i}>{format(week, 'MMM yyyy')}</span>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
