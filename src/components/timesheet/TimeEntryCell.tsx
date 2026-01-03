'use client';

import { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { TimeEntry, Project } from '@/types';
import { cn, formatTime } from '@/utils';

interface TimeEntryCellProps {
  entries: TimeEntry[];
  date: string;
  isToday: boolean;
  projects: Project[];
  onAddEntry: (date: string) => void;
  onEditEntry: (entry: TimeEntry) => void;
}

export function TimeEntryCell({
  entries,
  date,
  isToday,
  projects,
  onAddEntry,
  onEditEntry,
}: TimeEntryCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  const getProjectColor = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.color || '#9ca3af';
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || 'Unknown';
  };

  return (
    <div
      className={cn(
        'min-h-[120px] border-r border-dark-700 p-2 transition-colors',
        isToday ? 'bg-knowall-green/5' : 'bg-dark-800',
        isHovered && 'bg-dark-700/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onEditEntry(entry)}
            className="w-full text-left p-2 rounded-md hover:bg-dark-600/50 transition-colors group"
            style={{
              backgroundColor: `${getProjectColor(entry.projectId)}20`,
              borderLeft: `3px solid ${getProjectColor(entry.projectId)}`,
            }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-xs font-medium text-dark-200 truncate">
                {getProjectName(entry.projectId)}
              </span>
              <span className="text-xs text-dark-400 shrink-0">
                {formatTime(entry.hours)}
              </span>
            </div>
            {entry.notes && (
              <p className="text-xs text-dark-400 truncate mt-0.5">
                {entry.notes}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Add button */}
      {(isHovered || entries.length === 0) && (
        <button
          onClick={() => onAddEntry(date)}
          className={cn(
            'w-full mt-2 p-2 rounded-md border-2 border-dashed border-dark-600 text-dark-500',
            'hover:border-knowall-green hover:text-knowall-green hover:bg-knowall-green/10 transition-colors',
            'flex items-center justify-center gap-1 text-xs'
          )}
        >
          <PlusIcon className="w-4 h-4" />
          <span>Add</span>
        </button>
      )}

      {/* Day total */}
      {totalHours > 0 && (
        <div className="mt-2 pt-2 border-t border-dark-700">
          <p className="text-xs font-medium text-dark-300 text-right">
            {formatTime(totalHours)}
          </p>
        </div>
      )}
    </div>
  );
}
