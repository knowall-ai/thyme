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
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { Card, ExtensionPreviewWrapper } from '@/components/ui';
import { ApprovalCard } from './ApprovalCard';
import { ApprovalFilters } from './ApprovalFilters';
import { useApprovalStore, useCompanyStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { getUserProfilePhoto } from '@/services/auth/graphService';
import { bcClient } from '@/services/bc/bcClient';
import { cn, DATE_FORMAT_FULL, DATE_FORMAT_SHORT } from '@/utils';
import type { BCTimeSheet, BCTimeSheetLine, BCProject, BCJobTask } from '@/types';

type GroupBy = 'none' | 'week' | 'person';

export function ApprovalList() {
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const emailDomain = account?.username?.split('@')[1] || '';

  // Helper to get full email - handles both full email and username-only formats
  const getFullEmail = (resourceEmail: string | undefined): string | null => {
    if (!resourceEmail) return null;
    // If already a full email, use it directly
    if (resourceEmail.includes('@')) return resourceEmail;
    // Otherwise, append the domain from the logged-in user
    if (emailDomain) return `${resourceEmail}@${emailDomain}`;
    return null;
  };
  const {
    allApprovals,
    pendingApprovals,
    resources,
    selectedTimeSheet,
    selectedLines,
    filters,
    isLoading,
    isProcessing,
    error,
    isApprover,
    permissionChecked,
    extensionNotInstalled,
    fetchApprovals,
    fetchTimeSheetLines,
    selectTimeSheet,
    setFilters,
    clearFilters,
    approveTimeSheet,
    rejectTimeSheet,
    deleteTimeSheet,
    checkApprovalPermission,
  } = useApprovalStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linesCache, setLinesCache] = useState<Record<string, BCTimeSheetLine[]>>({});
  const [photosCache, setPhotosCache] = useState<Record<string, string | null>>({});
  const [jobsCache, setJobsCache] = useState<Record<string, BCProject>>({});
  const [tasksCache, setTasksCache] = useState<Record<string, BCJobTask[]>>({});
  const [jobsApiFailed, setJobsApiFailed] = useState(false); // Track if jobs API is unavailable
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
            // Check for invalid/placeholder dates (year 0001 or 1)
            if (startDate.getFullYear() <= 1 || endDate.getFullYear() <= 1) {
              label = 'Unknown dates';
            } else {
              label = `${format(startDate, DATE_FORMAT_SHORT)} - ${format(endDate, DATE_FORMAT_FULL)}`;
            }
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
  // companyVersion ensures refetch when company switches.
  useEffect(() => {
    checkApprovalPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyVersion]);

  useEffect(() => {
    if (permissionChecked && isApprover) {
      fetchApprovals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionChecked, isApprover, companyVersion]);

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
        const email = getFullEmail(ts.resourceEmail);
        if (email && !(email in photosCache)) {
          uniqueEmails.add(email);
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
    if (pendingApprovals.length > 0) {
      prefetchPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingApprovals, emailDomain, photosCache]);

  // Pre-fetch job and task names for lines
  // Skip if jobs API has previously failed (e.g., 404 - endpoint not available)
  useEffect(() => {
    async function prefetchJobData() {
      // Skip if jobs API is known to be unavailable
      if (jobsApiFailed) return;

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

      // Fetch all projects and filter for the ones we need
      // Note: Uses /projects endpoint (Thyme extension) instead of /jobs (standard API which may not be available)
      try {
        const allProjects = await bcClient.getProjects();
        const projectMap: Record<string, BCProject> = {};
        allProjects.forEach((project) => {
          if (uniqueJobNos.has(project.number)) {
            projectMap[project.number] = project;
          }
        });
        setJobsCache((prev) => ({ ...prev, ...projectMap }));

        // Fetch tasks for each job
        for (const jobNo of uniqueJobNos) {
          if (!tasksCache[jobNo]) {
            try {
              const tasks = await bcClient.getJobTasks(jobNo);
              setTasksCache((prev) => ({ ...prev, [jobNo]: tasks }));
            } catch {
              // Silently fail for individual task fetches - will show fallback
            }
          }
        }
      } catch (err) {
        // If projects API returns 404 or similar, mark it as failed to prevent repeated calls
        console.warn('Projects API unavailable, will show project codes instead:', err);
        setJobsApiFailed(true);
      }
    }

    const hasLinesWithJobs = Object.values(linesCache).some((lines) =>
      lines.some((line) => line.jobNo)
    );
    if (hasLinesWithJobs && !jobsApiFailed) {
      prefetchJobData();
    }
  }, [linesCache, jobsCache, tasksCache, jobsApiFailed]);

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

  const handleDelete = useCallback(
    async (timeSheetId: string, etag: string) => {
      // Find the timesheet to get employee name for better error messages
      const timeSheet = pendingApprovals.find((a) => a.id === timeSheetId);
      const employeeName = timeSheet?.resourceName || 'Unknown';

      const success = await deleteTimeSheet(timeSheetId, etag);
      if (success) {
        toast.success(`Timesheet for ${employeeName} deleted`);
        if (expandedId === timeSheetId) {
          setExpandedId(null);
        }
      } else {
        toast.error(`Failed to delete timesheet for ${employeeName}`);
      }
    },
    [deleteTimeSheet, expandedId, pendingApprovals]
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
      <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Approvals">
        <div className="py-12 text-center">
          <ClipboardDocumentCheckIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
          <p className="text-dark-400">No pending approvals available</p>
          <p className="text-dark-400 mt-1 text-sm">
            Timesheets requiring your approval will appear here
          </p>
        </div>
      </ExtensionPreviewWrapper>
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
          onClick={() => fetchApprovals()}
          className="text-thyme-500 hover:text-thyme-400 underline"
        >
          Try again
        </button>
      </Card>
    );
  }

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Approvals">
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
            resources={resources}
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
                        const email = getFullEmail(firstTs?.resourceEmail);
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
                    onDelete={
                      timeSheet['@odata.etag']
                        ? () => handleDelete(timeSheet.id, timeSheet['@odata.etag']!)
                        : undefined
                    }
                    hidePerson={groupBy === 'person'}
                    hideWeek={groupBy === 'week'}
                    resourceEmail={getFullEmail(timeSheet.resourceEmail) || undefined}
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
    </ExtensionPreviewWrapper>
  );
}
