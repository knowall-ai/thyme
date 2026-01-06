'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { DocumentDuplicateIcon, EyeIcon } from '@heroicons/react/24/outline';
import { useTimeEntriesStore, useProjectsStore, useTeammateStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { Button, Card } from '@/components/ui';
import { WeekNavigation } from './WeekNavigation';
import { TimeEntryCell } from './TimeEntryCell';
import { TimeEntryModal } from './TimeEntryModal';
import type { TimeEntry } from '@/types';
import { getWeekDays, formatDate, isDayToday, formatTime } from '@/utils';
import { getRandomQuote } from '@/config/quotes';

export function WeeklyTimesheet() {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';
  const { selectedTeammate } = useTeammateStore();
  const isViewingTeammate = selectedTeammate !== null;

  const {
    entries,
    currentWeekStart,
    isLoading,
    fetchWeekEntries,
    fetchTeammateEntries,
    navigateToWeek,
    goToCurrentWeek,
    goToDate,
    copyPreviousWeek,
    getEntriesForDay,
    getTotalHours,
  } = useTimeEntriesStore();

  const { projects, error: projectsError, fetchProjects } = useProjectsStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);

  // Pick a random quote on mount
  const quote = useMemo(() => getRandomQuote(), []);

  // Fetch data on mount and when week or teammate changes
  useEffect(() => {
    if (selectedTeammate) {
      fetchTeammateEntries(selectedTeammate, currentWeekStart);
    } else if (userId) {
      fetchWeekEntries(userId, currentWeekStart);
    }
  }, [userId, currentWeekStart, fetchWeekEntries, fetchTeammateEntries, selectedTeammate]);

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
    setSelectedDate(date);
    setSelectedEntry(null);
    setIsModalOpen(true);
  };

  const handleEditEntry = (entry: TimeEntry) => {
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
    if (userId) {
      try {
        await copyPreviousWeek(userId);
        toast.success('Previous week entries copied');
      } catch (error) {
        console.error('Failed to copy previous week:', error);
        toast.error('Failed to copy previous week entries. Please try again.');
      }
    }
  };

  const totalHours = getTotalHours();

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
            <Button variant="outline" size="sm" onClick={handleCopyPreviousWeek} disabled={isLoading}>
              <DocumentDuplicateIcon className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Copy previous week</span>
            </Button>
          </div>
        )}
      </div>

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
                  readOnly={isViewingTeammate}
                />
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && entries.length === 0 && (
          <div className="py-12 text-center">
            {isViewingTeammate ? (
              <>
                <p className="mb-2 text-dark-300">
                  No time entries found for {selectedTeammate.displayName} this week.
                </p>
                <p className="text-sm text-dark-500">
                  Time entries will appear here once synced to Business Central.
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
