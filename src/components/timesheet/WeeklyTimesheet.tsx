'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import {
  DocumentDuplicateIcon,
  EyeIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { useTimeEntriesStore, useProjectsStore, useTeammateStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { Button, Card, WeekNavigation, ExtensionPreviewWrapper } from '@/components/ui';
import { TimeEntryCell } from './TimeEntryCell';
import { TimeEntryModal } from './TimeEntryModal';
import type { TimeEntry, TimesheetDisplayStatus } from '@/types';
import { getWeekDays, formatDate, isDayToday, formatTime, getWeekStart } from '@/utils';
import { getBCResourcesListUrl } from '@/utils/bcUrls';
import { getRandomQuote } from '@/config/quotes';

// Status badge colors
const statusColors: Record<TimesheetDisplayStatus, string> = {
  Open: 'bg-blue-500/20 text-blue-400',
  'Partially Submitted': 'bg-yellow-500/20 text-yellow-400',
  Submitted: 'bg-purple-500/20 text-purple-400',
  Rejected: 'bg-amber-500/20 text-amber-400',
  Approved: 'bg-green-500/20 text-green-400',
  Mixed: 'bg-orange-500/20 text-orange-400',
};

export function WeeklyTimesheet() {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';
  const userEmail = account?.username || '';
  const { selectedTeammate } = useTeammateStore();
  const isViewingTeammate = selectedTeammate !== null;

  const searchParams = useSearchParams();
  const router = useRouter();
  const [urlInitialized, setUrlInitialized] = useState(false);

  const {
    entries,
    currentWeekStart,
    isLoading,
    currentTimesheet,
    timesheetStatus,
    noTimesheetExists,
    noResourceExists,
    extensionNotInstalled,
    fetchWeekEntries,
    fetchTeammateEntries,
    navigateToWeek,
    goToCurrentWeek,
    goToDate,
    copyPreviousWeek,
    getEntriesForDay,
    getTotalHours,
    submitTimesheet,
    reopenTimesheet,
    isTimesheetEditable,
  } = useTimeEntriesStore();

  const {
    projects,
    isLoading: projectsLoading,
    error: projectsError,
    fetchProjects,
  } = useProjectsStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pick a random quote on mount
  const quote = useMemo(() => getRandomQuote(), []);

  // Determine if editing is allowed
  const canEdit = !isViewingTeammate && isTimesheetEditable();

  // Effect 1: Initialize from URL on mount (runs synchronously before paint)
  // Read directly from window.location for reliable access on initial render
  useLayoutEffect(() => {
    if (urlInitialized) return;

    // Read week param directly from URL (more reliable than useSearchParams on mount)
    const urlParams = new URLSearchParams(window.location.search);
    const weekParam = urlParams.get('week');

    if (weekParam) {
      try {
        const date = parseISO(weekParam);
        if (!isNaN(date.getTime())) {
          const urlWeekStart = getWeekStart(date);
          const currentWeekStr = format(currentWeekStart, 'yyyy-MM-dd');
          const urlWeekStr = format(urlWeekStart, 'yyyy-MM-dd');

          // Navigate if URL week differs from current store value
          if (urlWeekStr !== currentWeekStr) {
            goToDate(date);
            // Don't set initialized yet - wait for store to update
            return;
          }
        }
      } catch {
        // Invalid date, ignore
      }
    }

    // URL matches store or no URL param - mark as initialized
    setUrlInitialized(true);
  }, [urlInitialized, currentWeekStart, goToDate]);

  // Effect 2: Sync URL when week changes (after initialization)
  useEffect(() => {
    // Don't update URL until initialization is complete
    if (!urlInitialized) return;

    const weekStr = format(currentWeekStart, 'yyyy-MM-dd');
    const weekParam = searchParams.get('week');

    if (weekStr !== weekParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('week', weekStr);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [urlInitialized, currentWeekStart, searchParams, router]);

  // Fetch data on mount and when week or teammate changes
  // Wait for URL initialization to avoid fetching wrong week first
  useEffect(() => {
    if (!urlInitialized) return;

    if (selectedTeammate) {
      fetchTeammateEntries(selectedTeammate, currentWeekStart);
    } else if (userEmail) {
      fetchWeekEntries(userEmail, currentWeekStart);
    }
  }, [
    urlInitialized,
    userEmail,
    currentWeekStart,
    fetchWeekEntries,
    fetchTeammateEntries,
    selectedTeammate,
  ]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Show toast when projects fail to load (entries errors handled locally in components)
  // Don't show toast when extension isn't installed - the modal handles that
  useEffect(() => {
    if (projectsError && !extensionNotInstalled) {
      toast.error('Failed to load projects. Some features may not work correctly.');
    }
  }, [projectsError, extensionNotInstalled]);

  const weekDays = getWeekDays(currentWeekStart);

  const handleAddEntry = (date: string) => {
    if (!canEdit) {
      toast.error('Timesheet is not editable. Please reopen it first.');
      return;
    }
    setSelectedDate(date);
    setSelectedEntry(null);
    setIsModalOpen(true);
  };

  const handleEditEntry = (entry: TimeEntry) => {
    if (!canEdit) {
      toast.error('Timesheet is not editable. Please reopen it first.');
      return;
    }
    setSelectedDate(entry.date);
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDate(null);
    setSelectedEntry(null);
  };

  const handleCopyPreviousWeek = async () => {
    if (!canEdit) {
      toast.error('Timesheet is not editable. Please reopen it first.');
      return;
    }
    if (userEmail) {
      try {
        await copyPreviousWeek(userEmail);
      } catch {
        // Error already shown by service
      }
    }
  };

  const handleSubmitTimesheet = async () => {
    if (!currentTimesheet) return;
    setIsSubmitting(true);
    try {
      await submitTimesheet();
    } catch {
      // Error already shown by service
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenTimesheet = async () => {
    if (!currentTimesheet) return;
    setIsSubmitting(true);
    try {
      await reopenTimesheet();
    } catch {
      // Error already shown by service
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalHours = getTotalHours();

  // No resource record exists state
  if (noResourceExists && !isViewingTeammate) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            onPrevious={() => navigateToWeek('prev')}
            onNext={() => navigateToWeek('next')}
            onToday={goToCurrentWeek}
            onDateSelect={goToDate}
          />
        </div>

        {/* No Resource Message */}
        <Card variant="bordered" className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <UserCircleIcon className="mb-4 h-12 w-12 text-red-500" />
            <h3 className="mb-2 text-lg font-semibold text-white">Resource Record Not Found</h3>
            <p className="text-dark-300 mb-4 max-w-md">
              No Resource record was found in Business Central for your account. A Resource record
              is required before you can enter time.
            </p>

            <div className="max-w-lg text-left">
              <p className="text-dark-300 mb-2 text-sm font-medium">
                To resolve this, ask your Business Central administrator to:
              </p>
              <ol className="text-dark-400 list-inside list-decimal space-y-2 text-sm">
                <li>
                  Open{' '}
                  <a
                    href={getBCResourcesListUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-thyme-400 hover:text-thyme-300 font-medium underline"
                  >
                    Resources
                  </a>{' '}
                  in Business Central
                </li>
                <li>
                  Create or edit a Resource record with{' '}
                  <span className="text-dark-200 font-medium">Type: Person</span>
                </li>
                <li>
                  Set <span className="text-dark-200 font-medium">Base Unit of Measure</span> to{' '}
                  <span className="text-dark-200 font-medium">HOUR</span>
                </li>
                <li>
                  Enable <span className="text-dark-200 font-medium">Use Time Sheet</span>
                </li>
                <li>
                  Set <span className="text-dark-200 font-medium">Time Sheet Owner User ID</span> to
                  the employee&apos;s BC User ID
                </li>
                <li>
                  Set <span className="text-dark-200 font-medium">Time Sheet Approver User ID</span>{' '}
                  to the approver
                </li>
                <li>Save the Resource record</li>
              </ol>

              <div className="mt-4 flex justify-center">
                <a
                  href={`mailto:?subject=${encodeURIComponent('Thyme Setup: Resource Record Needed')}&body=${encodeURIComponent(`Hi,

I need a Resource record set up in Business Central so I can use Thyme for time tracking.

Please create or update a Resource with the following settings:

1. Open Resources in Business Central
2. Create or edit a Resource record with Type: Person
3. Set Base Unit of Measure to HOUR
4. Enable Use Time Sheet
5. Set Time Sheet Owner User ID to my BC User ID
6. Set Time Sheet Approver User ID to the approver
7. Save the Resource record

Thank you!`)}`}
                  className="bg-thyme-600 hover:bg-thyme-500 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
                >
                  <EnvelopeIcon className="h-4 w-4" />
                  Email request to manager
                </a>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // No timesheet exists state
  if (noTimesheetExists && !isViewingTeammate) {
    const weekStartStr = format(currentWeekStart, 'MMM d');
    const weekEndStr = format(
      new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
      'MMM d, yyyy'
    );
    const weekStartDate = format(currentWeekStart, 'yyyy-MM-dd');

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            onPrevious={() => navigateToWeek('prev')}
            onNext={() => navigateToWeek('next')}
            onToday={goToCurrentWeek}
            onDateSelect={goToDate}
          />
        </div>

        {/* No Timesheet Message */}
        <Card variant="bordered" className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <ExclamationTriangleIcon className="mb-4 h-12 w-12 text-yellow-500" />
            <h3 className="mb-2 text-lg font-semibold text-white">No Timesheet Available</h3>
            <p className="text-dark-300 mb-4 max-w-md">
              There is no timesheet created for the week of {weekStartStr} - {weekEndStr}. A
              timesheet must be created before you can enter time.
            </p>

            <div className="max-w-lg text-left">
              <p className="text-dark-300 mb-2 text-sm font-medium">
                To resolve this, ask your timesheet manager to:
              </p>
              <ol className="text-dark-400 list-inside list-decimal space-y-2 text-sm">
                <li>
                  Open your{' '}
                  <a
                    href={getBCResourcesListUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-thyme-400 hover:text-thyme-300 font-medium underline"
                  >
                    Resource
                  </a>{' '}
                  in Business Central
                </li>
                <li>
                  Click <span className="text-dark-200 font-medium">Create Time Sheets...</span>
                </li>
                <li>
                  Set <span className="text-dark-200 font-medium">Starting Date</span> to{' '}
                  <span className="text-dark-200 font-medium">{weekStartStr}</span>
                </li>
                <li>
                  Set <span className="text-dark-200 font-medium">No. of Periods</span> (e.g., 1 for
                  one week)
                </li>
                <li>
                  Click <span className="text-dark-200 font-medium">OK</span> to create the
                  timesheet
                </li>
              </ol>

              <div className="mt-4 flex justify-center">
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Thyme: Timesheet Needed for Week of ${weekStartStr}`)}&body=${encodeURIComponent(`Hi,

I need a timesheet created in Business Central for the week of ${weekStartStr} - ${weekEndStr} so I can enter my time in Thyme.

Please create a timesheet using the following steps:

1. Open my Resource in Business Central
2. Click Create Time Sheets...
3. Set Starting Date to ${weekStartDate}
4. Set No. of Periods to 1
5. Click OK

Thank you!`)}`}
                  className="bg-thyme-600 hover:bg-thyme-500 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
                >
                  <EnvelopeIcon className="h-4 w-4" />
                  Email request to manager
                </a>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <ExtensionPreviewWrapper
      extensionNotInstalled={extensionNotInstalled && !isViewingTeammate}
      pageName="Timesheet"
    >
      <div className="space-y-6">
        {/* Teammate View Banner */}
        {isViewingTeammate && (
          <div className="border-thyme-600/30 bg-thyme-900/20 flex items-center gap-3 rounded-lg border px-4 py-3">
            <EyeIcon className="text-thyme-500 h-5 w-5" />
            <div className="flex-1">
              <span className="text-dark-200 text-sm">
                Viewing{' '}
                <span className="font-medium text-white">{selectedTeammate.displayName}</span>
                &apos;s timesheet
              </span>
              {selectedTeammate.jobTitle && (
                <span className="text-dark-400 ml-2 text-xs">({selectedTeammate.jobTitle})</span>
              )}
            </div>
            <span className="bg-thyme-600/20 text-thyme-400 rounded px-2 py-1 text-xs">
              Read-only
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <WeekNavigation
            currentWeekStart={currentWeekStart}
            onPrevious={() => navigateToWeek('prev')}
            onNext={() => navigateToWeek('next')}
            onToday={goToCurrentWeek}
            onDateSelect={goToDate}
          />

          {!isViewingTeammate && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPreviousWeek}
                disabled={isLoading || !canEdit}
              >
                <DocumentDuplicateIcon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Copy previous week</span>
              </Button>
            </div>
          )}
        </div>

        {/* Timesheet Status Bar */}
        {currentTimesheet && timesheetStatus && !isViewingTeammate && (
          <div className="border-dark-700 bg-dark-850 flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="text-dark-400 text-sm">
                Timesheet: <span className="font-medium text-white">{currentTimesheet.number}</span>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${statusColors[timesheetStatus]}`}
              >
                {timesheetStatus}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {(timesheetStatus === 'Open' || timesheetStatus === 'Partially Submitted') && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitTimesheet}
                  disabled={isSubmitting || entries.length === 0}
                >
                  <PaperAirplaneIcon className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Submit for Approval</span>
                  <span className="sm:hidden">Submit</span>
                </Button>
              )}
              {timesheetStatus === 'Rejected' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReopenTimesheet}
                  disabled={isSubmitting}
                >
                  <ArrowPathIcon className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Reopen for Editing</span>
                  <span className="sm:hidden">Reopen</span>
                </Button>
              )}
              {timesheetStatus === 'Submitted' && (
                <>
                  <span className="text-dark-400 text-sm">Awaiting approval</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReopenTimesheet}
                    disabled={isSubmitting}
                  >
                    <ArrowPathIcon className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Reopen</span>
                    <span className="sm:hidden">Reopen</span>
                  </Button>
                </>
              )}
              {timesheetStatus === 'Approved' && (
                <span className="text-sm text-green-400">Timesheet approved</span>
              )}
            </div>
          </div>
        )}

        {/* Week Summary */}
        <div className="flex items-center gap-6">
          <div className="text-dark-400 text-sm">
            Week total: <span className="font-semibold text-white">{formatTime(totalHours)}</span>
          </div>
          {entries.length > 0 && (
            <div className="text-dark-400 text-sm">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </div>
          )}
          {!canEdit && currentTimesheet && !isViewingTeammate && (
            <span className="rounded bg-yellow-500/20 px-2 py-1 text-xs text-yellow-400">
              Read-only
            </span>
          )}
        </div>

        {/* Timesheet Grid */}
        <Card variant="bordered" className="overflow-hidden">
          {/* Day Headers */}
          <div className="border-dark-700 bg-dark-900 grid grid-cols-7 border-b">
            {weekDays.map((day) => {
              const isToday = isDayToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`border-dark-700 border-r p-3 text-center last:border-r-0 ${
                    isToday ? 'bg-knowall-green/10' : ''
                  }`}
                >
                  <p className="text-dark-400 text-xs font-medium uppercase">
                    {format(day, 'EEE')}
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      isToday ? 'text-knowall-green' : 'text-white'
                    }`}
                  >
                    {format(day, 'd')}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Entries Grid */}
          {isLoading || projectsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const dateStr = formatDate(day);
                const dayEntries = getEntriesForDay(dateStr);
                const isToday = isDayToday(day);

                return (
                  <TimeEntryCell
                    key={day.toISOString()}
                    entries={dayEntries}
                    date={dateStr}
                    isToday={isToday}
                    projects={projects}
                    onAddEntry={handleAddEntry}
                    onEditEntry={handleEditEntry}
                    readOnly={!canEdit}
                  />
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !projectsLoading && entries.length === 0 && !noTimesheetExists && (
            <div className="py-12 text-center">
              {isViewingTeammate ? (
                <>
                  <p className="text-dark-300 mb-2">
                    No time entries found for {selectedTeammate.displayName} this week.
                  </p>
                  <p className="text-dark-500 text-sm">
                    Time entries will appear here once added to their timesheet.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-dark-300 mb-4">&quot;{quote.text}&quot;</p>
                  <p className="text-dark-500 text-sm">
                    — {quote.author}
                    {quote.source && <>, {quote.source}</>}
                  </p>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Time Entry Modal */}
        <TimeEntryModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          date={selectedDate}
          entry={selectedEntry}
        />
      </div>
    </ExtensionPreviewWrapper>
  );
}
