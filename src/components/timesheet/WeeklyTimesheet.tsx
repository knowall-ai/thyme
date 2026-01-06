'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { useTimeEntriesStore, useProjectsStore } from '@/hooks';
import { useAuth } from '@/services/auth';
import { Button, Card } from '@/components/ui';
import { WeekNavigation } from './WeekNavigation';
import { TimeEntryCell } from './TimeEntryCell';
import { TimeEntryModal } from './TimeEntryModal';
import type { TimeEntry } from '@/types';
import { getWeekDays, formatDate, isDayToday, formatTime } from '@/utils';

export function WeeklyTimesheet() {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';

  const {
    entries,
    currentWeekStart,
    isLoading,
    fetchWeekEntries,
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

  // Fetch data on mount and when week changes
  useEffect(() => {
    if (userId) {
      fetchWeekEntries(userId, currentWeekStart);
    }
  }, [userId, currentWeekStart, fetchWeekEntries]);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <WeekNavigation
          currentWeekStart={currentWeekStart}
          onPrevious={() => navigateToWeek('prev')}
          onNext={() => navigateToWeek('next')}
          onToday={goToCurrentWeek}
          onDateSelect={goToDate}
        />

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleCopyPreviousWeek} disabled={isLoading}>
            <DocumentDuplicateIcon className="mr-2 h-4 w-4" />
            Copy previous week
          </Button>
        </div>
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
                />
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && entries.length === 0 && (
          <div className="py-12 text-center">
            <p className="mb-4 text-dark-300">
              &quot;This is not a moment, it&apos;s the movement.&quot;
            </p>
            <p className="text-sm text-dark-500">- Lin-Manuel Miranda</p>
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
