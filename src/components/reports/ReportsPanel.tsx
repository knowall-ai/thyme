'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, ExtensionPreviewWrapper } from '@/components/ui';
import { ExtensionNotInstalledError, NoTimesheetError } from '@/services/bc';
import {
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UsersIcon,
  ChevronDownIcon,
  UserIcon,
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
  isSameWeek,
  isSameMonth,
} from 'date-fns';
import { useAuth } from '@/services/auth';
import { useProjectsStore, useCompanyStore } from '@/hooks';
import { timeEntryService, bcClient } from '@/services/bc';
import { cn, formatTime } from '@/utils';
import type { TimeEntry, BCResource } from '@/types';

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
  billableHours: number;
}

export function ReportsPanel() {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  const [selectedMember, setSelectedMember] = useState<BCResource | 'everyone' | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [resources, setResources] = useState<BCResource[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  const { account } = useAuth();
  const currentUserEmail = account?.username || '';
  const { projects, fetchProjects } = useProjectsStore();
  const { selectedCompany, companyVersion } = useCompanyStore();

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

  // Fetch resources on mount and when company changes
  useEffect(() => {
    const fetchResources = async () => {
      setIsLoadingResources(true);
      try {
        // Get all person resources (same as Team page)
        const data = await bcClient.getResources();
        setResources(data);
      } catch (err) {
        console.error('Failed to fetch resources:', err);
        setResources([]);
      } finally {
        setIsLoadingResources(false);
      }
    };
    fetchResources();
    // companyVersion changes when company switches, ensuring refetch
  }, [companyVersion]);

  // Set default to 'everyone' once resources are loaded
  useEffect(() => {
    if (selectedMember === null && resources.length > 0) {
      setSelectedMember('everyone');
    }
  }, [resources, selectedMember]);

  // Get the resource timeSheetOwnerUserId(s) to fetch based on selection
  const getResourceUserIds = (): string[] => {
    if (selectedMember === 'everyone') {
      return resources.map((r) => r.timeSheetOwnerUserId).filter((id): id is string => !!id);
    } else if (selectedMember) {
      return selectedMember.timeSheetOwnerUserId ? [selectedMember.timeSheetOwnerUserId] : [];
    }
    return [];
  };

  // Fetch entries when date range or selected member changes
  useEffect(() => {
    const userIds = getResourceUserIds();
    if (userIds.length === 0 && selectedMember !== null) {
      setEntries([]);
      return;
    }

    const fetchAllEntries = async () => {
      setIsLoading(true);
      setError(null);
      setExtensionNotInstalled(false);
      try {
        // Fetch entries for all selected resources
        const allEntries: TimeEntry[] = [];
        for (const userId of userIds) {
          try {
            const data = await timeEntryService.getEntries(startDate, endDate, userId);
            allEntries.push(...data);
          } catch (err) {
            if (err instanceof ExtensionNotInstalledError) {
              setExtensionNotInstalled(true);
              break;
            } else if (!(err instanceof NoTimesheetError)) {
              // Log but continue for other users
              console.error(`Failed to fetch entries for ${userId}:`, err);
            }
          }
        }
        setEntries(allEntries);
      } catch (err) {
        console.error('Failed to fetch entries for reports:', err);
        setError('Failed to load report data');
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllEntries();
    // companyVersion ensures refetch when company switches
  }, [selectedMember, resources, startDate, endDate, companyVersion]);

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
        const project = projects.find((p) => p.code === projectId);
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

  // Calculate daily breakdown with billable/unbillable split
  const dailyBreakdown = useMemo((): DayBreakdown[] => {
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    // Calculate totals and billable hours per day
    const dailyData = entries.reduce(
      (acc, entry) => {
        if (!acc[entry.date]) {
          acc[entry.date] = { hours: 0, billableHours: 0 };
        }
        acc[entry.date].hours += entry.hours;
        if (entry.isBillable) {
          acc[entry.date].billableHours += entry.hours;
        }
        return acc;
      },
      {} as { [date: string]: { hours: number; billableHours: number } }
    );

    return days.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const data = dailyData[dateStr] || { hours: 0, billableHours: 0 };
      return {
        date: dateStr,
        label: format(day, 'EEE, MMM d'),
        hours: data.hours,
        billableHours: data.billableHours,
      };
    });
  }, [entries, startDate, endDate]);

  // Find max hours for bar chart scaling
  const maxProjectHours = Math.max(...projectHours.map((p) => p.hours), 1);
  // Daily capacity based on selected resources (8 hours per resource per day)
  const resourceCount = selectedMember === 'everyone' ? resources.length : 1;
  const dailyCapacity = resourceCount * 8;
  // Use the greater of capacity or max hours to ensure bars fit
  const maxDailyHours = Math.max(...dailyBreakdown.map((d) => d.hours), dailyCapacity);

  const getDateRangeLabel = () => {
    if (dateRange === 'week') {
      return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
    }
    return format(referenceDate, 'MMMM yyyy');
  };

  // Check if viewing current period
  const isCurrentPeriod =
    dateRange === 'week'
      ? isSameWeek(referenceDate, new Date(), { weekStartsOn: 1 })
      : isSameMonth(referenceDate, new Date());

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Reports">
      <div className="space-y-6">
        {/* Date Range Selector */}
        <Card variant="bordered" className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                className="bg-dark-700 text-dark-300 hover:bg-dark-600 rounded-lg p-2 transition-colors hover:text-white"
                aria-label="Previous period"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                onClick={handleNext}
                className="bg-dark-700 text-dark-300 hover:bg-dark-600 rounded-lg p-2 transition-colors hover:text-white"
                aria-label="Next period"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
              {!isCurrentPeriod && (
                <button
                  onClick={handleToday}
                  className="bg-dark-700 text-dark-300 hover:bg-dark-600 rounded-lg px-3 py-2 text-sm transition-colors hover:text-white"
                >
                  Today
                </button>
              )}
              <CalendarIcon className="text-dark-400 ml-2 h-5 w-5" />
              <span className="text-dark-100">{getDateRangeLabel()}</span>
            </div>
            <div className="flex items-center gap-4">
              {/* Team Member Filter */}
              <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    'border-dark-600 bg-dark-700 hover:border-dark-500 hover:bg-dark-600 border',
                    isFilterOpen && 'border-thyme-500'
                  )}
                >
                  <UsersIcon className="text-dark-400 h-4 w-4" />
                  <span className="text-dark-200">
                    {selectedMember === 'everyone'
                      ? 'Everyone'
                      : selectedMember
                        ? selectedMember.name
                        : 'Loading...'}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      'text-dark-400 h-4 w-4 transition-transform',
                      isFilterOpen && 'rotate-180'
                    )}
                  />
                </button>

                {isFilterOpen && (
                  <div className="border-dark-600 bg-dark-800 absolute right-0 z-50 mt-2 w-64 rounded-lg border shadow-xl">
                    <div className="border-dark-600 border-b px-4 py-3">
                      <h3 className="text-sm font-medium text-white">Filter by Resource</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {/* Everyone option */}
                      <button
                        onClick={() => {
                          setSelectedMember('everyone');
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                          selectedMember === 'everyone' && 'bg-dark-700'
                        )}
                      >
                        <UsersIcon className="text-thyme-500 h-5 w-5" />
                        <span className="text-dark-200">Everyone</span>
                      </button>

                      {/* Individual resources */}
                      {isLoadingResources ? (
                        <div className="text-dark-400 px-4 py-3 text-center text-sm">
                          Loading...
                        </div>
                      ) : (
                        resources.map((resource) => (
                          <button
                            key={resource.id}
                            onClick={() => {
                              setSelectedMember(resource);
                              setIsFilterOpen(false);
                            }}
                            className={cn(
                              'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                              selectedMember !== 'everyone' &&
                                selectedMember?.id === resource.id &&
                                'bg-dark-700'
                            )}
                          >
                            <UserIcon className="text-dark-400 h-5 w-5" />
                            <div className="flex-1 truncate">
                              <div className="text-dark-200">{resource.name}</div>
                              <div className="text-dark-500 text-xs">{resource.number}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Week/Month Toggle */}
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
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-thyme-500/20 rounded-lg p-2">
                <ClockIcon className="text-thyme-500 h-5 w-5" />
              </div>
              <div>
                <p className="text-dark-400 text-sm">Total Hours</p>
                <p className="text-dark-100 text-xl font-bold">
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
                <p className="text-dark-400 text-sm">Billable Hours</p>
                <p className="text-dark-100 text-xl font-bold">
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
                <p className="text-dark-400 text-sm">Projects</p>
                <p className="text-dark-100 text-xl font-bold">
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
                <p className="text-dark-400 text-sm">Billable %</p>
                <p className="text-dark-100 text-xl font-bold">
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
            <button className="bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:text-white">
              <DocumentArrowDownIcon className="h-4 w-4" />
              Export
            </button>
          </div>
          {isLoading ? (
            <div className="text-dark-400 py-12 text-center">
              <div className="border-dark-600 border-t-thyme-500 mx-auto h-8 w-8 animate-spin rounded-full border-2"></div>
              <p className="mt-4">Loading...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-thyme-500 hover:text-thyme-400 underline"
              >
                Try again
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-dark-400 py-12 text-center">
              <ChartBarIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
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
                      <span className="text-dark-100 text-sm font-medium">
                        {project.projectName}
                      </span>
                    </div>
                    <span className="text-dark-400 text-sm">{formatTime(project.hours)}</span>
                  </div>
                  <div className="bg-dark-700 relative h-2 overflow-hidden rounded-full">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(project.hours / maxProjectHours) * 100}%`,
                        backgroundColor: project.projectColor,
                      }}
                    />
                  </div>
                  {project.billableHours > 0 && (
                    <p className="text-dark-500 text-xs">
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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Daily Breakdown</h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="bg-thyme-600 h-3 w-3 rounded-sm" />
                <span className="text-dark-300">Billable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-slate-500" />
                <span className="text-dark-300">Unbillable</span>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="text-dark-400 py-12 text-center">
              <div className="border-dark-600 border-t-thyme-500 mx-auto h-8 w-8 animate-spin rounded-full border-2"></div>
              <p className="mt-4">Loading...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-thyme-500 hover:text-thyme-400 underline"
              >
                Try again
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-dark-400 py-12 text-center">
              <CalendarIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
              <p>No time entries found for this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyBreakdown.map((day) => {
                const unbillableHours = day.hours - day.billableHours;
                const billableWidth = (day.billableHours / maxDailyHours) * 100;
                const unbillableWidth = (unbillableHours / maxDailyHours) * 100;

                return (
                  <div key={day.date} className="flex items-center gap-4">
                    <span className="text-dark-400 w-28 text-sm">{day.label}</span>
                    <div className="bg-dark-700 relative h-6 flex-1 overflow-hidden rounded">
                      {day.hours > 0 && (
                        <div className="absolute top-0 left-0 flex h-full">
                          {/* Billable segment */}
                          {day.billableHours > 0 && (
                            <div
                              className="bg-thyme-600 flex h-full items-center px-2 transition-all duration-500"
                              style={{
                                width: `${billableWidth}%`,
                                minWidth: day.billableHours > 0 ? '24px' : '0',
                              }}
                            >
                              <span className="text-xs font-medium text-white">
                                {formatTime(day.billableHours)}
                              </span>
                            </div>
                          )}
                          {/* Unbillable segment */}
                          {unbillableHours > 0 && (
                            <div
                              className="flex h-full items-center bg-slate-500 px-2 transition-all duration-500"
                              style={{
                                width: `${unbillableWidth}%`,
                                minWidth: unbillableHours > 0 ? '24px' : '0',
                              }}
                            >
                              <span className="text-xs font-medium text-white">
                                {formatTime(unbillableHours)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-dark-300 w-32 text-right text-xs">
                      <span className="text-thyme-400">{formatTime(day.billableHours)}</span>
                      {' + '}
                      <span className="text-slate-400">{formatTime(unbillableHours)}</span>
                      <span className="text-dark-500"> / {dailyCapacity}h</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </ExtensionPreviewWrapper>
  );
}
