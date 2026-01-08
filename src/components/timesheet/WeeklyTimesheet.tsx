'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  DocumentDuplicateIcon,
  EyeIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { useTimeEntriesStore, useProjectsStore, useTeammateStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { Button, Card } from '@/components/ui';
import { WeekNavigation } from './WeekNavigation';
import { TimeEntryCell } from './TimeEntryCell';
import { TimeEntryModal } from './TimeEntryModal';
import type { TimeEntry, TimesheetDisplayStatus } from '@/types';
import { getWeekDays, formatDate, isDayToday, formatTime } from '@/utils';
import { getBCHomeUrl, getBCResourcesListUrl } from '@/utils/bcUrls';
import { getRandomQuote } from '@/config/quotes';

// Status badge colors
const statusColors: Record<TimesheetDisplayStatus, string> = {
  Open: 'bg-blue-500/20 text-blue-400',
  'Partially Submitted': 'bg-yellow-500/20 text-yellow-400',
  Submitted: 'bg-purple-500/20 text-purple-400',
  Rejected: 'bg-red-500/20 text-red-400',
  Approved: 'bg-green-500/20 text-green-400',
  Mixed: 'bg-orange-500/20 text-orange-400',
};

export function WeeklyTimesheet() {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';
  const userEmail = account?.username || '';
  const { selectedTeammate } = useTeammateStore();
  const isViewingTeammate = selectedTeammate !== null;

  const {
    entries,
    currentWeekStart,
    isLoading,
    currentTimesheet,
    timesheetStatus,
    noTimesheetExists,
    noResourceExists,
    userEmail: storeUserEmail,
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

  const { projects, error: projectsError, fetchProjects } = useProjectsStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pick a random quote on mount
  const quote = useMemo(() => getRandomQuote(), []);

  // Determine if editing is allowed
  const canEdit = !isViewingTeammate && isTimesheetEditable();

  // Fetch data on mount and when week or teammate changes
  useEffect(() => {
    if (selectedTeammate) {
      fetchTeammateEntries(selectedTeammate, currentWeekStart);
    } else if (userEmail) {
      fetchWeekEntries(userEmail, currentWeekStart);
    }
  }, [userEmail, currentWeekStart, fetchWeekEntries, fetchTeammateEntries, selectedTeammate]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Show toast when projects fail to load (entries errors handled locally in components)
  useEffect(() => {
    if (projectsError) {
      toast.error('Failed to load projects. Some features may not work correctly.');
    }
  }, [projectsError]);

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
            <p className="mb-4 max-w-md text-dark-300">
              No Resource record was found in Business Central for your email address. A Resource
              record is required before you can enter time.
            </p>

            <div className="mb-4 rounded-lg border border-dark-700 bg-dark-900 px-4 py-3">
              <p className="text-sm text-dark-400">
                Your email: <span className="font-medium text-white">{storeUserEmail || userEmail}</span>
              </p>
            </div>

            <div className="max-w-lg text-left">
              <p className="mb-2 text-sm font-medium text-dark-300">
                To resolve this, ask your Business Central administrator to:
              </p>
              <ol className="list-inside list-decimal space-y-1 text-sm text-dark-400">
                <li>
                  Open{' '}
                  <a
                    href={getBCHomeUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-thyme-400 underline hover:text-thyme-300"
                  >
                    Business Central
                  </a>
                </li>
                <li>
                  Navigate to{' '}
                  <a
                    href={getBCResourcesListUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-thyme-400 underline hover:text-thyme-300"
                  >
                    Resources
                  </a>
                </li>
                <li>Create a new Resource record (Type: Person)</li>
                <li>
                  Set the <span className="font-medium text-dark-200">Search E-Mail</span> field to{' '}
                  <span className="font-medium text-thyme-400">{storeUserEmail || userEmail}</span>
                </li>
                <li>Save the Resource record</li>
              </ol>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // No timesheet exists state
  if (noTimesheetExists && !isViewingTeammate) {
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
            <p className="mb-4 max-w-md text-dark-300">
              There is no timesheet created for this week. Please contact your manager or timesheet
              administrator to create one for you.
            </p>
            <p className="text-sm text-dark-500">
              Week: {format(currentWeekStart, 'MMM d')} -{' '}
              {format(
                new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
                'MMM d, yyyy'
              )}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Teammate View Banner */}
      {isViewingTeammate && (
        <div className="flex items-center gap-3 rounded-lg border border-thyme-600/30 bg-thyme-900/20 px-4 py-3">
          <EyeIcon className="h-5 w-5 text-thyme-500" />
          <div className="flex-1">
            <span className="text-sm text-dark-200">
              Viewing <span className="font-medium text-white">{selectedTeammate.displayName}</span>
              &apos;s timesheet
            </span>
            {selectedTeammate.jobTitle && (
              <span className="ml-2 text-xs text-dark-400">({selectedTeammate.jobTitle})</span>
            )}
          </div>
          <span className="rounded bg-thyme-600/20 px-2 py-1 text-xs text-thyme-400">
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
        <div className="flex items-center justify-between rounded-lg border border-dark-700 bg-dark-850 px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="text-sm text-dark-400">
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
              <span className="text-sm text-dark-400">Awaiting approval</span>
            )}
            {timesheetStatus === 'Approved' && (
              <span className="text-sm text-green-400">Timesheet approved</span>
            )}
          </div>
        </div>
      )}

      {/* Week Summary */}
      <div className="flex items-center gap-6">
        <div className="text-sm text-dark-400">
          Week total: <span className="font-semibold text-white">{formatTime(totalHours)}</span>
        </div>
        {entries.length > 0 && (
          <div className="text-sm text-dark-400">
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
        <div className="grid grid-cols-7 border-b border-dark-700 bg-dark-900">
          {weekDays.map((day) => {
            const isToday = isDayToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`border-r border-dark-700 p-3 text-center last:border-r-0 ${
                  isToday ? 'bg-knowall-green/10' : ''
                }`}
              >
                <p className="text-xs font-medium uppercase text-dark-400">{format(day, 'EEE')}</p>
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
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-knowall-green"></div>
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
        {!isLoading && entries.length === 0 && !noTimesheetExists && (
          <div className="py-12 text-center">
            {isViewingTeammate ? (
              <>
                <p className="mb-2 text-dark-300">
                  No time entries found for {selectedTeammate.displayName} this week.
                </p>
                <p className="text-sm text-dark-500">
                  Time entries will appear here once added to their timesheet.
                </p>
              </>
            ) : (
              <>
                <p className="mb-4 text-dark-300">&quot;{quote.text}&quot;</p>
                <p className="text-sm text-dark-500">
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
  );
}
