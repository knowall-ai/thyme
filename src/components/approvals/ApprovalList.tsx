'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import {
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  CalendarDaysIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Card } from '@/components/ui';
import { ApprovalCard } from './ApprovalCard';
import { ApprovalFilters } from './ApprovalFilters';
import { useApprovalStore, useCompanyStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { getUserProfilePhoto } from '@/services/auth/graphService';
import { bcClient } from '@/services/bc/bcClient';
import { cn } from '@/utils';
import type { BCTimeSheet, BCTimeSheetLine, BCJob, BCJobTask } from '@/types';

type GroupBy = 'none' | 'week' | 'person';

export function ApprovalList() {
  const { selectedCompany } = useCompanyStore();
  const { account } = useAuth();
  const emailDomain = account?.username?.split('@')[1] || '';
  const {
    allApprovals,
    pendingApprovals,
    selectedTimeSheet,
    selectedLines,
    filters,
    isLoading,
    isProcessing,
    error,
    isApprover,
    permissionChecked,
    fetchPendingApprovals,
    fetchTimeSheetLines,
    selectTimeSheet,
    setFilters,
    clearFilters,
    approveTimeSheet,
    rejectTimeSheet,
    checkApprovalPermission,
  } = useApprovalStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linesCache, setLinesCache] = useState<Record<string, BCTimeSheetLine[]>>({});
  const [photosCache, setPhotosCache] = useState<Record<string, string | null>>({});
  const [jobsCache, setJobsCache] = useState<Record<string, BCJob>>({});
  const [tasksCache, setTasksCache] = useState<Record<string, BCJobTask[]>>({});
  const [groupBy, setGroupBy] = useState<GroupBy>('week');

  // Calculate actual pending hours from lines cache
  const actualPendingHours = useMemo(() => {
    let total = 0;
    pendingApprovals.forEach((ts) => {
      const lines = linesCache[ts.id];
      if (lines && lines.length > 0) {
        total += lines.reduce((sum, line) => sum + (line.totalQuantity || 0), 0);
      } else {
        // Fallback to timeSheet.totalQuantity if lines not loaded
        total += ts.totalQuantity || 0;
      }
    });
    return total;
  }, [pendingApprovals, linesCache]);

  // Group approvals based on selected grouping
  const groupedApprovals = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', items: pendingApprovals }];
    }

    const groups = new Map<string, BCTimeSheet[]>();

    pendingApprovals.forEach((timeSheet) => {
      const key = groupBy === 'week' ? timeSheet.startingDate : timeSheet.resourceNo;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(timeSheet);
    });

    // Convert to array and sort
    return Array.from(groups.entries())
      .map(([key, items]) => {
        let label: string;
        if (groupBy === 'week') {
          try {
            const startDate = parseISO(items[0].startingDate);
            const endDate = parseISO(items[0].endingDate);
            label = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
          } catch {
            label = key;
          }
        } else {
          label = items[0].resourceName || key;
        }
        return { key, label, items };
      })
      .sort((a, b) => {
        if (groupBy === 'week') {
          // Sort by date descending (newest first)
          return b.key.localeCompare(a.key);
        }
        // Sort by name ascending
        return a.label.localeCompare(b.label);
      });
  }, [pendingApprovals, groupBy]);

  // Fetch permissions and approvals on mount and when company changes
  // Note: Zustand actions are stable references, but ESLint doesn't know that.
  // We intentionally omit them from deps to avoid infinite re-renders.
  useEffect(() => {
    checkApprovalPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  useEffect(() => {
    if (permissionChecked && isApprover) {
      fetchPendingApprovals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionChecked, isApprover, selectedCompany]);

  // Update lines cache when selectedLines changes
  useEffect(() => {
    if (selectedTimeSheet && selectedLines.length > 0) {
      setLinesCache((prev) => ({
        ...prev,
        [selectedTimeSheet.id]: selectedLines,
      }));
    }
  }, [selectedTimeSheet, selectedLines]);

  // Pre-fetch lines for all pending timesheets to show hours/billable %
  useEffect(() => {
    async function prefetchLines() {
      for (const timeSheet of pendingApprovals) {
        if (!linesCache[timeSheet.id]) {
          try {
            const lines = await bcClient.getTimeSheetLines(timeSheet.number);
            setLinesCache((prev) => ({
              ...prev,
              [timeSheet.id]: lines,
            }));
          } catch {
            // Silently fail - will show fallback
          }
        }
      }
    }
    if (pendingApprovals.length > 0) {
      prefetchLines();
    }
  }, [pendingApprovals, linesCache]);

  // Pre-fetch profile photos for all unique resources
  useEffect(() => {
    async function prefetchPhotos() {
      const uniqueEmails = new Set<string>();
      pendingApprovals.forEach((ts) => {
        if (ts.resourceEmail && emailDomain) {
          const email = `${ts.resourceEmail}@${emailDomain}`;
          if (!photosCache[email]) {
            uniqueEmails.add(email);
          }
        }
      });

      for (const email of uniqueEmails) {
        try {
          const photo = await getUserProfilePhoto(email);
          setPhotosCache((prev) => ({ ...prev, [email]: photo }));
        } catch {
          setPhotosCache((prev) => ({ ...prev, [email]: null }));
        }
      }
    }
    if (pendingApprovals.length > 0 && emailDomain) {
      prefetchPhotos();
    }
  }, [pendingApprovals, emailDomain, photosCache]);

  // Pre-fetch job and task names for lines
  useEffect(() => {
    async function prefetchJobData() {
      // Collect unique job numbers from all lines
      const uniqueJobNos = new Set<string>();
      Object.values(linesCache).forEach((lines) => {
        lines.forEach((line) => {
          if (line.jobNo && !jobsCache[line.jobNo]) {
            uniqueJobNos.add(line.jobNo);
          }
        });
      });

      if (uniqueJobNos.size === 0) return;

      // Fetch all jobs and filter for the ones we need
      try {
        const allJobs = await bcClient.getJobs();
        const jobMap: Record<string, BCJob> = {};
        allJobs.forEach((job) => {
          if (uniqueJobNos.has(job.number)) {
            jobMap[job.number] = job;
          }
        });
        setJobsCache((prev) => ({ ...prev, ...jobMap }));

        // Fetch tasks for each job
        for (const jobNo of uniqueJobNos) {
          if (!tasksCache[jobNo]) {
            try {
              const tasks = await bcClient.getJobTasks(jobNo);
              setTasksCache((prev) => ({ ...prev, [jobNo]: tasks }));
            } catch {
              // Silently fail - will show fallback
            }
          }
        }
      } catch {
        // Silently fail - will show fallback (job codes)
      }
    }

    const hasLinesWithJobs = Object.values(linesCache).some((lines) =>
      lines.some((line) => line.jobNo)
    );
    if (hasLinesWithJobs) {
      prefetchJobData();
    }
  }, [linesCache, jobsCache, tasksCache]);

  const handleToggleExpand = useCallback(
    async (timeSheet: BCTimeSheet) => {
      if (expandedId === timeSheet.id) {
        setExpandedId(null);
        selectTimeSheet(null);
      } else {
        setExpandedId(timeSheet.id);
        selectTimeSheet(timeSheet);
        // Fetch lines if not cached
        if (!linesCache[timeSheet.id]) {
          await fetchTimeSheetLines(timeSheet.number);
        }
      }
    },
    [expandedId, linesCache, fetchTimeSheetLines, selectTimeSheet]
  );

  const handleApprove = useCallback(
    async (timeSheetId: string, comment?: string) => {
      // Find the timesheet to get employee name for better error messages
      const timeSheet = pendingApprovals.find((a) => a.id === timeSheetId);
      const employeeName = timeSheet?.resourceName || 'Unknown';

      const success = await approveTimeSheet(timeSheetId, comment);
      if (success) {
        toast.success(`Timesheet for ${employeeName} approved`);
        if (expandedId === timeSheetId) {
          setExpandedId(null);
        }
      } else {
        toast.error(`Failed to approve timesheet for ${employeeName}`);
      }
    },
    [approveTimeSheet, expandedId, pendingApprovals]
  );

  const handleReject = useCallback(
    async (timeSheetId: string, comment: string) => {
      // Find the timesheet to get employee name for better error messages
      const timeSheet = pendingApprovals.find((a) => a.id === timeSheetId);
      const employeeName = timeSheet?.resourceName || 'Unknown';

      const success = await rejectTimeSheet(timeSheetId, comment);
      if (success) {
        toast.success(`Timesheet for ${employeeName} rejected`);
        if (expandedId === timeSheetId) {
          setExpandedId(null);
        }
      } else {
        toast.error(`Failed to reject timesheet for ${employeeName}`);
      }
    },
    [rejectTimeSheet, expandedId, pendingApprovals]
  );

  // Permission check loading state
  if (!permissionChecked) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-thyme-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  // Not an approver
  if (!isApprover) {
    return (
      <Card variant="bordered" className="p-8 text-center">
        <div className="bg-dark-700 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <XMarkIcon className="text-dark-400 h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-white">No Approval Access</h3>
        <p className="text-dark-400 mt-2">
          You don&apos;t have permission to approve timesheets. Contact your administrator if you
          believe this is an error.
        </p>
      </Card>
    );
  }

  // Loading state
  if (isLoading && pendingApprovals.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-thyme-600 h-8 w-8 animate-spin rounded-full border-b-2"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card variant="bordered" className="p-8 text-center">
        <p className="mb-2 text-red-500">{error}</p>
        <button
          onClick={() => fetchPendingApprovals()}
          className="text-thyme-500 hover:text-thyme-400 underline"
        >
          Try again
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card variant="bordered" className="p-4">
          <p className="text-dark-400 text-sm">
            {pendingApprovals.length !== allApprovals.length
              ? `Matching Timesheets (${allApprovals.length} total)`
              : 'Pending Approvals'}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{pendingApprovals.length}</p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-dark-400 text-sm">
            {pendingApprovals.length !== allApprovals.length
              ? 'Filtered Hours'
              : 'Total Hours Pending'}
          </p>
          <p className="text-dark-100 mt-1 flex items-center gap-2 text-2xl font-bold">
            <ClockIcon className="h-6 w-6" />
            {actualPendingHours.toFixed(1)}
          </p>
        </Card>
      </div>

      {/* Filters and Grouping */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ApprovalFilters
          filters={filters}
          onFilterChange={setFilters}
          onClearFilters={clearFilters}
          allTimesheets={allApprovals}
        />

        {/* Group by toggle */}
        <div className="border-dark-600 bg-dark-800 flex items-center gap-1 rounded-lg border p-1">
          <button
            onClick={() => setGroupBy(groupBy === 'week' ? 'none' : 'week')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'week'
                ? 'bg-thyme-600 text-white'
                : 'text-dark-400 hover:bg-dark-700 hover:text-white'
            )}
            title="Group by week"
          >
            <CalendarDaysIcon className="h-4 w-4" />
            By Week
          </button>
          <button
            onClick={() => setGroupBy(groupBy === 'person' ? 'none' : 'person')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'person'
                ? 'bg-thyme-600 text-white'
                : 'text-dark-400 hover:bg-dark-700 hover:text-white'
            )}
            title="Group by person"
          >
            <UserIcon className="h-4 w-4" />
            By Person
          </button>
        </div>
      </div>

      {/* Approval list */}
      {pendingApprovals.length > 0 ? (
        <div className="space-y-4">
          {/* Grouped approval cards */}
          {groupedApprovals.map((group) => (
            <div key={group.key} className="space-y-3">
              {/* Group header (only show if grouping is active) */}
              {groupBy !== 'none' && (
                <div className="border-dark-700 flex items-center gap-2 border-b pb-2">
                  {groupBy === 'week' ? (
                    <CalendarDaysIcon className="text-thyme-500 h-8 w-8" />
                  ) : (
                    // Show profile photo for person group
                    (() => {
                      const firstTs = group.items[0];
                      const email =
                        firstTs?.resourceEmail && emailDomain
                          ? `${firstTs.resourceEmail}@${emailDomain}`
                          : null;
                      const photo = email ? photosCache[email] : null;
                      return photo ? (
                        <img
                          src={photo}
                          alt={group.label}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <UserIcon className="text-thyme-500 h-8 w-8" />
                      );
                    })()
                  )}
                  <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                  <span className="text-dark-400 text-xs">
                    ({group.items.length} timesheet{group.items.length !== 1 ? 's' : ''})
                  </span>
                </div>
              )}

              {/* Approval cards in this group */}
              {group.items.map((timeSheet) => (
                <ApprovalCard
                  key={timeSheet.id}
                  timeSheet={timeSheet}
                  lines={linesCache[timeSheet.id] || []}
                  isExpanded={expandedId === timeSheet.id}
                  isProcessing={isProcessing}
                  onToggleExpand={() => handleToggleExpand(timeSheet)}
                  onApprove={(comment) => handleApprove(timeSheet.id, comment)}
                  onReject={(comment) => handleReject(timeSheet.id, comment)}
                  hidePerson={groupBy === 'person'}
                  hideWeek={groupBy === 'week'}
                  resourceEmail={
                    timeSheet.resourceEmail && emailDomain
                      ? `${timeSheet.resourceEmail}@${emailDomain}`
                      : undefined
                  }
                  jobsCache={jobsCache}
                  tasksCache={tasksCache}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <Card variant="bordered" className="p-8 text-center">
          {/* Check if we have any approvals at all vs just filtered to nothing */}
          {allApprovals.length > 0 ? (
            // Filters are hiding results
            <>
              <div className="bg-dark-700 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <CalendarDaysIcon className="text-dark-400 h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-white">No Matching Timesheets</h3>
              <p className="text-dark-400 mt-2">
                No timesheets match your current filters. Try adjusting or clearing your filters.
              </p>
              <button
                onClick={clearFilters}
                className="text-thyme-500 hover:text-thyme-400 mt-4 underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            // Truly no pending approvals
            <>
              <div className="bg-thyme-500/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <CheckIcon className="text-thyme-500 h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-white">All Caught Up!</h3>
              <p className="text-dark-400 mt-2">There are no timesheets pending your approval.</p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
