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
  readOnly?: boolean;
}

export function TimeEntryCell({
  entries,
  date,
  isToday,
  projects,
  onAddEntry,
  onEditEntry,
  readOnly = false,
}: TimeEntryCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  const getProjectColor = (projectId: string) => {
    // projectId is now a job code (e.g., "PR00030"), not a GUID
    const project = projects.find((p) => p.code === projectId);
    return project?.color || '#9ca3af';
  };

  const getProjectName = (projectId: string) => {
    // projectId is now a job code (e.g., "PR00030"), not a GUID
    const project = projects.find((p) => p.code === projectId);
    return project?.name || 'Unknown';
  };

  return (
    <div
      className={cn(
        'min-h-[100px] border-r border-dark-700 p-2 transition-colors last:border-r-0 sm:min-h-[120px]',
        isToday ? 'bg-knowall-green/5' : 'bg-dark-800',
        isHovered && 'bg-dark-700/50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            onClick={readOnly ? undefined : () => onEditEntry(entry)}
            role={readOnly ? undefined : 'button'}
            tabIndex={readOnly ? undefined : 0}
            onKeyDown={
              readOnly
                ? undefined
                : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onEditEntry(entry);
                    }
                  }
            }
            className={cn(
              'w-full rounded-md p-2 text-left transition-colors',
              !readOnly && 'cursor-pointer hover:bg-dark-600/50'
            )}
            style={{
              backgroundColor: `${getProjectColor(entry.projectId)}20`,
              borderLeft: `3px solid ${getProjectColor(entry.projectId)}`,
            }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="truncate text-xs font-medium text-dark-200">
                {getProjectName(entry.projectId)}
              </span>
              <span className="shrink-0 text-xs text-dark-400">{formatTime(entry.hours)}</span>
            </div>
            {entry.notes && <p className="mt-0.5 truncate text-xs text-dark-400">{entry.notes}</p>}
          </div>
        ))}
      </div>

      {/* Add button - always visible when not in read-only mode */}
      {!readOnly && (
        <button
          onClick={() => onAddEntry(date)}
          className={cn(
            'mt-2 w-full rounded-md border-2 border-dashed border-dark-600 p-2 text-dark-500',
            'transition-colors hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green',
            'flex items-center justify-center gap-1 text-xs'
          )}
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add</span>
        </button>
      )}

      {/* Day total */}
      {totalHours > 0 && (
        <div className="mt-2 border-t border-dark-700 pt-2">
          <p className="text-right text-xs font-medium text-dark-300">{formatTime(totalHours)}</p>
        </div>
      )}
    </div>
  );
}
