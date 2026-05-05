'use client';

import { useState, type DragEvent } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { TimeEntry, Project } from '@/types';
import { cn, formatTime } from '@/utils';

const DRAG_MIME_TYPE = 'application/x-thyme-entry-id';

interface TimeEntryCellProps {
  entries: TimeEntry[];
  date: string;
  isToday: boolean;
  projects: Project[];
  onAddEntry: (date: string) => void;
  onEditEntry: (entry: TimeEntry) => void;
  onMoveEntry?: (entryId: string, newDate: string) => void;
  readOnly?: boolean;
}

export function TimeEntryCell({
  entries,
  date,
  isToday,
  projects,
  onAddEntry,
  onEditEntry,
  onMoveEntry,
  readOnly = false,
}: TimeEntryCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleDragStart = (e: DragEvent<HTMLDivElement>, entry: TimeEntry) => {
    e.dataTransfer.setData(DRAG_MIME_TYPE, entry.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly || !onMoveEntry) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the cell entirely, not when crossing child elements
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (readOnly || !onMoveEntry) return;
    const entryId = e.dataTransfer.getData(DRAG_MIME_TYPE);
    setIsDragOver(false);
    if (!entryId) return;
    onMoveEntry(entryId, date);
  };

  return (
    <div
      className={cn(
        'border-dark-700 min-h-[100px] border-r p-2 transition-colors last:border-r-0 sm:min-h-[120px]',
        isToday ? 'bg-knowall-green/5' : 'bg-dark-800',
        isHovered && !isDragOver && 'bg-dark-700/50',
        isDragOver && 'ring-knowall-green/60 bg-knowall-green/10 ring-2 ring-inset'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
            draggable={!readOnly && !!onMoveEntry}
            onDragStart={readOnly ? undefined : (e) => handleDragStart(e, entry)}
            className={cn(
              'w-full rounded-md p-2 text-left transition-colors',
              !readOnly && 'hover:bg-dark-600/50 cursor-pointer',
              !readOnly && onMoveEntry && 'cursor-grab active:cursor-grabbing'
            )}
            style={{
              backgroundColor: `${getProjectColor(entry.projectId)}20`,
              borderLeft: `3px solid ${getProjectColor(entry.projectId)}`,
            }}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-dark-200 truncate text-xs font-medium">
                {getProjectName(entry.projectId)}
              </span>
              <span className="text-dark-400 shrink-0 text-xs">{formatTime(entry.hours)}</span>
            </div>
            {entry.notes && <p className="text-dark-400 mt-0.5 truncate text-xs">{entry.notes}</p>}
          </div>
        ))}
      </div>

      {/* Add button - always visible when not in read-only mode */}
      {!readOnly && (
        <button
          onClick={() => onAddEntry(date)}
          className={cn(
            'border-dark-600 text-dark-500 mt-2 w-full rounded-md border-2 border-dashed p-2',
            'hover:border-knowall-green hover:bg-knowall-green/10 hover:text-knowall-green transition-colors',
            'flex items-center justify-center gap-1 text-xs'
          )}
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add</span>
        </button>
      )}

      {/* Day total */}
      {totalHours > 0 && (
        <div className="border-dark-700 mt-2 border-t pt-2">
          <p className="text-dark-300 text-right text-xs font-medium">{formatTime(totalHours)}</p>
        </div>
      )}
    </div>
  );
}
