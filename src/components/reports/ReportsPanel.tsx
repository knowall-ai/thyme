'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui';
import {
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from 'date-fns';
import { useAuth } from '@/services/auth';
import { useProjectsStore } from '@/hooks';
import { timeEntryService } from '@/services/bc';
import { formatTime } from '@/utils';
import type { TimeEntry } from '@/types';

type DateRange = 'week' | 'month';

interface ProjectHours {
  projectId: string;
  projectName: string;
  projectColor: string;
  hours: number;
  billableHours: number;
}

interface DayBreakdown {
  date: string;
  label: string;
  hours: number;
}

export function ReportsPanel() {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { account } = useAuth();
  const userId = account?.localAccountId || '';
  const { projects, fetchProjects } = useProjectsStore();

  // Calculate date range boundaries
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'week') {
      return {
        startDate: startOfWeek(referenceDate, { weekStartsOn: 1 }),
        endDate: endOfWeek(referenceDate, { weekStartsOn: 1 }),
      };
    } else {
      return {
        startDate: startOfMonth(referenceDate),
        endDate: endOfMonth(referenceDate),
      };
    }
  }, [dateRange, referenceDate]);

  // Navigation handlers
  const handlePrevious = () => {
    if (dateRange === 'week') {
      setReferenceDate((prev) => subWeeks(prev, 1));
    } else {
      setReferenceDate((prev) => subMonths(prev, 1));
    }
  };

  const handleNext = () => {
    if (dateRange === 'week') {
      setReferenceDate((prev) => addWeeks(prev, 1));
    } else {
      setReferenceDate((prev) => addMonths(prev, 1));
    }
  };

  const handleToday = () => {
    setReferenceDate(new Date());
  };

  // Fetch entries when date range or user changes
  useEffect(() => {
    if (!userId) return;

    const fetchEntries = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await timeEntryService.getEntries(startDate, endDate, userId);
        setEntries(data);
      } catch (err) {
        console.error('Failed to fetch entries for reports:', err);
        setError('Failed to load report data');
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEntries();
  }, [userId, startDate, endDate]);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Calculate statistics from entries
  const stats = useMemo(() => {
    const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
    const billableHours = entries
      .filter((entry) => entry.isBillable)
      .reduce((sum, entry) => sum + entry.hours, 0);
    const uniqueProjects = new Set(entries.map((entry) => entry.projectId)).size;
    const billablePercentage = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

    return { totalHours, billableHours, uniqueProjects, billablePercentage };
  }, [entries]);

  // Calculate hours by project
  const projectHours = useMemo((): ProjectHours[] => {
    const projectMap = new Map<string, { hours: number; billableHours: number }>();

    entries.forEach((entry) => {
      const existing = projectMap.get(entry.projectId) || { hours: 0, billableHours: 0 };
      existing.hours += entry.hours;
      if (entry.isBillable) {
        existing.billableHours += entry.hours;
      }
      projectMap.set(entry.projectId, existing);
    });

    return Array.from(projectMap.entries())
      .map(([projectId, data]) => {
        const project = projects.find((p) => p.id === projectId);
        return {
          projectId,
          projectName: project?.name || 'Unknown Project',
          projectColor: project?.color || '#6B7280',
          hours: data.hours,
          billableHours: data.billableHours,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [entries, projects]);

  // Calculate daily breakdown
  const dailyBreakdown = useMemo((): DayBreakdown[] => {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const dailyTotals = timeEntryService.getDailyTotals(entries);

    return days.map((day) => ({
      date: format(day, 'yyyy-MM-dd'),
      label: format(day, 'EEE, MMM d'),
      hours: dailyTotals[format(day, 'yyyy-MM-dd')] || 0,
    }));
  }, [entries, startDate, endDate]);

  // Find max hours for bar chart scaling
  const maxProjectHours = Math.max(...projectHours.map((p) => p.hours), 1);
  const maxDailyHours = Math.max(...dailyBreakdown.map((d) => d.hours), 1);

  const getDateRangeLabel = () => {
    if (dateRange === 'week') {
      return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
    }
    return format(referenceDate, 'MMMM yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <Card variant="bordered" className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              className="rounded-lg bg-dark-700 p-2 text-dark-300 transition-colors hover:bg-dark-600 hover:text-white"
              aria-label="Previous period"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={handleNext}
              className="rounded-lg bg-dark-700 p-2 text-dark-300 transition-colors hover:bg-dark-600 hover:text-white"
              aria-label="Next period"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
            <button
              onClick={handleToday}
              className="rounded-lg bg-dark-700 px-3 py-2 text-sm text-dark-300 transition-colors hover:bg-dark-600 hover:text-white"
            >
              Today
            </button>
            <CalendarIcon className="ml-2 h-5 w-5 text-dark-400" />
            <span className="text-dark-100">{getDateRangeLabel()}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange('week')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                dateRange === 'week'
                  ? 'bg-thyme-600 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange('month')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                dateRange === 'month'
                  ? 'bg-thyme-600 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              This Month
            </button>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-thyme-500/20 p-2">
              <ClockIcon className="h-5 w-5 text-thyme-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Total Hours</p>
              <p className="text-xl font-bold text-dark-100">
                {isLoading ? '...' : formatTime(stats.totalHours)}
              </p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <ChartBarIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Billable Hours</p>
              <p className="text-xl font-bold text-dark-100">
                {isLoading ? '...' : formatTime(stats.billableHours)}
              </p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/20 p-2">
              <ChartBarIcon className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Projects</p>
              <p className="text-xl font-bold text-dark-100">
                {isLoading ? '...' : stats.uniqueProjects}
              </p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/20 p-2">
              <ChartBarIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Billable %</p>
              <p className="text-xl font-bold text-dark-100">
                {isLoading ? '...' : `${stats.billablePercentage}%`}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Project Breakdown */}
      <Card variant="bordered" className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Hours by Project</h2>
          <button className="flex items-center gap-2 rounded-lg bg-dark-700 px-3 py-1.5 text-sm text-dark-300 transition-colors hover:bg-dark-600 hover:text-white">
            <DocumentArrowDownIcon className="h-4 w-4" />
            Export
          </button>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-dark-400">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-dark-600 border-t-thyme-500"></div>
            <p className="mt-4">Loading...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="mb-2 text-red-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-thyme-500 underline hover:text-thyme-400"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-dark-400">
            <ChartBarIcon className="mx-auto mb-4 h-12 w-12 text-dark-600" />
            <p>No time entries found for this period</p>
            <p className="mt-1 text-sm">Start tracking time to see your reports here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projectHours.map((project) => (
              <div key={project.projectId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: project.projectColor }}
                    />
                    <span className="text-sm font-medium text-dark-100">{project.projectName}</span>
                  </div>
                  <span className="text-sm text-dark-400">{formatTime(project.hours)}</span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-dark-700">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(project.hours / maxProjectHours) * 100}%`,
                      backgroundColor: project.projectColor,
                    }}
                  />
                </div>
                {project.billableHours > 0 && (
                  <p className="text-xs text-dark-500">
                    {formatTime(project.billableHours)} billable
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Daily Breakdown */}
      <Card variant="bordered" className="p-6">
        <h2 className="mb-6 text-lg font-semibold text-white">Daily Breakdown</h2>
        {isLoading ? (
          <div className="py-12 text-center text-dark-400">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-dark-600 border-t-thyme-500"></div>
            <p className="mt-4">Loading...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="mb-2 text-red-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-thyme-500 underline hover:text-thyme-400"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-dark-400">
            <CalendarIcon className="mx-auto mb-4 h-12 w-12 text-dark-600" />
            <p>No time entries found for this period</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dailyBreakdown.map((day) => (
              <div key={day.date} className="flex items-center gap-4">
                <span className="w-28 text-sm text-dark-400">{day.label}</span>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-dark-700">
                  {day.hours > 0 && (
                    <div
                      className="absolute left-0 top-0 flex h-full items-center rounded bg-thyme-600 px-2 transition-all duration-500"
                      style={{
                        width: `${(day.hours / maxDailyHours) * 100}%`,
                        minWidth: '24px',
                      }}
                    >
                      <span className="text-xs font-medium text-white">
                        {formatTime(day.hours)}
                      </span>
                    </div>
                  )}
                </div>
                <span className="w-16 text-right text-sm font-medium text-dark-100">
                  {day.hours > 0 ? formatTime(day.hours) : '-'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
