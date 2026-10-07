'use client';

import { useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useTimeEntriesStore, useSettingsStore } from '@/hooks';
import { useTimeSuggestions } from '@/hooks/useTimeSuggestions';
import { useAuth } from '@/services/auth';
import { timeEntryService } from '@/services/bc';
import { Button, Card } from '@/components/ui';
import { TimeEntryModal, type TimeEntryPrefill } from './TimeEntryModal';
import type {
  BCTimeSuggestion,
  Project,
  Task,
  TimeEntry,
  TimeSuggestionConfidence,
  TimeSuggestionSource,
} from '@/types';
import { cn, formatDateForDisplay, formatTime } from '@/utils';
import {
  canQuickAdd,
  groupSuggestionsByDay,
  hideDuplicateSuggestions,
  roundToQuarterHour,
  suggestionNotes,
} from '@/utils/timeSuggestions';

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function DevOpsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
    </svg>
  );
}

const sourceIcons: Record<TimeSuggestionSource, (props: { className?: string }) => ReactNode> = {
  Calendar: CalendarDaysIcon,
  GitHub: GitHubIcon,
  DevOps: DevOpsIcon,
  Other: SparklesIcon,
};

const sourceLabels: Record<TimeSuggestionSource, string> = {
  Calendar: 'Calendar',
  GitHub: 'GitHub',
  DevOps: 'Azure DevOps',
  Other: 'Other',
};

const confidenceDots: Record<TimeSuggestionConfidence, string> = {
  High: 'bg-green-400',
  Medium: 'bg-yellow-400',
  Low: 'bg-dark-400',
};

interface PoppieSuggestionsPanelProps {
  // Resource whose timesheet is on screen (yours or a teammate's)
  resourceNo: string | null;
  weekStart: Date;
  entries: TimeEntry[];
  entriesLoading: boolean;
  projects: Project[];
  canEdit: boolean;
  // Why suggestions can't be added, shown in place of the Add buttons
  readOnlyReason?: string | null;
}

/**
 * Poppie's suggested time entries for the week on screen. Add creates the entry the
 * same way the grid's "+ Add" does; Edit opens the entry modal pre-filled; Dismiss
 * hides it (with undo). Hidden entirely when the BC extension has no timeSuggestions API.
 */
export function PoppieSuggestionsPanel({
  resourceNo,
  weekStart,
  entries,
  entriesLoading,
  projects,
  canEdit,
  readOnlyReason,
}: PoppieSuggestionsPanelProps) {
  const { account } = useAuth();
  const userId = account?.localAccountId || '';
  const { addEntry } = useTimeEntriesStore();
  const { requireTimesheetComments } = useSettingsStore();
  const { suggestions, isLoading, isAvailable, accept, dismiss, restore } = useTimeSuggestions(
    resourceNo,
    weekStart
  );

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [editing, setEditing] = useState<BCTimeSuggestion | null>(null);

  const visible = useMemo(
    () => hideDuplicateSuggestions(suggestions, entries),
    [suggestions, entries]
  );
  const days = useMemo(() => groupSuggestionsByDay(visible), [visible]);

  const resolve = (s: BCTimeSuggestion): { project?: Project; task?: Task } => {
    const project = s.jobNo ? projects.find((p) => p.code === s.jobNo) : undefined;
    const task = project?.tasks.find((t) => t.code === s.jobTaskNo);
    return { project, task };
  };

  // One click only when Thyme knows the project and task; otherwise the modal fills the gaps
  const isQuickAddable = (s: BCTimeSuggestion) => {
    const { project, task } = resolve(s);
    return canQuickAdd(s, requireTimesheetComments) && !!project && !!task;
  };

  const highConfidence = visible.filter((s) => s.confidence === 'High' && isQuickAddable(s));

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  // Record which line the suggestion became. The entry is already saved, so a failed
  // write-back is only a warning; the duplicate check keeps the suggestion hidden.
  const markAccepted = async (s: BCTimeSuggestion, entry: TimeEntry) => {
    const lineNo = entry.bcTimeSheetLineId
      ? timeEntryService.getTimeSheetLineNo(entry.bcTimeSheetLineId)
      : null;
    try {
      await accept(s, entry.bcTimeSheetNo || '', lineNo);
    } catch {
      toast.error("Entry added, but Poppie's suggestion couldn't be marked as accepted.");
    }
  };

  const addSuggestion = async (s: BCTimeSuggestion) => {
    const { task } = resolve(s);
    const entry = await addEntry({
      projectId: s.jobNo,
      taskId: s.jobTaskNo,
      userId,
      date: s.date,
      hours: roundToQuarterHour(s.quantity),
      notes: suggestionNotes(s),
      isBillable: task?.isBillable ?? true,
      isRunning: false,
    });
    await markAccepted(s, entry);
  };

  // One click when Thyme knows the project and task; otherwise the pre-filled modal fills the gaps
  const handleAdd = async (s: BCTimeSuggestion) => {
    if (!canEdit) return;
    if (!isQuickAddable(s)) {
      setEditing(s);
      return;
    }
    setBusy(s.id, true);
    try {
      await addSuggestion(s);
      toast.success('Time entry added');
    } catch {
      toast.error('Failed to add time entry. Please try again.');
    } finally {
      setBusy(s.id, false);
    }
  };

  const handleEdit = (s: BCTimeSuggestion) => {
    if (!canEdit) return;
    setEditing(s);
  };

  const handleUndoDismiss = async (s: BCTimeSuggestion) => {
    try {
      await restore(s);
    } catch {
      toast.error("Couldn't restore the suggestion. Please try again.");
    }
  };

  const handleDismiss = async (s: BCTimeSuggestion) => {
    setBusy(s.id, true);
    try {
      await dismiss(s);
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Suggestion dismissed
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                handleUndoDismiss(s);
              }}
              className="text-thyme-400 hover:text-thyme-300 font-medium"
            >
              Undo
            </button>
          </span>
        ),
        { duration: 6000 }
      );
    } catch {
      toast.error("Couldn't dismiss the suggestion. Please try again.");
    } finally {
      setBusy(s.id, false);
    }
  };

  const handleAddAll = async () => {
    if (!canEdit || highConfidence.length === 0) return;
    const total = highConfidence.reduce((sum, s) => sum + roundToQuarterHour(s.quantity), 0);
    const count = highConfidence.length;
    if (
      !window.confirm(
        `Add ${count} high-confidence ${count === 1 ? 'suggestion' : 'suggestions'} (${formatTime(total)}) to this week?`
      )
    ) {
      return;
    }

    setIsAddingAll(true);
    let added = 0;
    // One at a time: each creates a timesheet line, and BC handles those best sequentially
    for (const s of highConfidence) {
      setBusy(s.id, true);
      try {
        await addSuggestion(s);
        added++;
      } catch {
        // Carry on with the rest; the failures stay in the list to retry
      } finally {
        setBusy(s.id, false);
      }
    }
    setIsAddingAll(false);

    if (added === count) {
      toast.success(`Added ${added} ${added === 1 ? 'entry' : 'entries'}`);
    } else {
      toast.error(`Added ${added} of ${count} entries. Please try the rest again.`);
    }
  };

  const handleModalSaved = (created: TimeEntry | null) => {
    if (editing && created) markAccepted(editing, created);
  };

  // The same modal the grid uses, started from the suggestion's values
  const prefill = useMemo<TimeEntryPrefill | null>(
    () =>
      editing
        ? {
            key: editing.id,
            projectCode: editing.jobNo || undefined,
            taskCode: editing.jobTaskNo || undefined,
            hours: roundToQuarterHour(editing.quantity),
            notes: suggestionNotes(editing),
          }
        : null,
    [editing]
  );

  if (!resourceNo || !isAvailable) return null;

  const showSkeleton = (isLoading || entriesLoading) && visible.length === 0;

  return (
    <>
      <Card variant="bordered" className="overflow-hidden">
        {/* Header */}
        <div className="border-dark-700 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="text-thyme-400 h-5 w-5" />
            <h3 className="text-sm font-semibold text-white">Poppie&apos;s suggestions</h3>
            {visible.length > 0 && (
              <span className="bg-dark-700 text-dark-300 rounded px-1.5 py-0.5 text-xs">
                {visible.length}
              </span>
            )}
          </div>
          {canEdit
            ? highConfidence.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleAddAll} disabled={isAddingAll}>
                  <PlusIcon className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {isAddingAll
                      ? 'Adding...'
                      : `Add all high confidence (${highConfidence.length})`}
                  </span>
                </Button>
              )
            : readOnlyReason &&
              visible.length > 0 && (
                <span className="text-dark-400 flex items-center gap-1.5 text-xs">
                  <LockClosedIcon className="h-3.5 w-3.5" />
                  {readOnlyReason}
                </span>
              )}
        </div>

        {/* Body */}
        {showSkeleton ? (
          <div className="space-y-2 p-4" aria-label="Loading suggestions">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-dark-700/60 h-10 animate-pulse rounded-md" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-dark-400 px-4 py-6 text-center text-sm">
            No suggestions yet — Poppie checks calendars, GitHub and DevOps through the day.
          </p>
        ) : (
          <div className="divide-dark-700 divide-y">
            {days.map((day) => (
              <div key={day.date} className="px-4 py-3">
                <p className="text-dark-400 mb-2 text-xs font-medium uppercase">
                  {formatDateForDisplay(day.date)}
                </p>
                <ul className="space-y-1">
                  {day.suggestions.map((s) => {
                    const SourceIcon = sourceIcons[s.source] ?? SparklesIcon;
                    const { project, task } = resolve(s);
                    const busy = busyIds.has(s.id);
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          'hover:bg-dark-700/40 flex items-start gap-3 rounded-md px-2 py-2',
                          busy && 'opacity-60'
                        )}
                      >
                        <span
                          className="text-dark-300 mt-0.5 shrink-0"
                          title={sourceLabels[s.source] ?? s.source}
                        >
                          <SourceIcon className="h-4 w-4" />
                          <span className="sr-only">{sourceLabels[s.source] ?? s.source}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-dark-100 truncate text-sm">
                            {s.description || 'Untitled activity'}
                          </p>
                          <p className="text-dark-400 truncate text-xs">
                            {s.jobNo ? (
                              <>
                                {project?.name || s.jobNo}
                                {(task?.name || s.jobTaskNo) && <> · {task?.name || s.jobTaskNo}</>}
                              </>
                            ) : (
                              <span className="text-yellow-400/80">Choose project</span>
                            )}
                          </p>
                          <p className="text-dark-500 flex items-center gap-1.5 text-xs">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                confidenceDots[s.confidence]
                              )}
                              aria-hidden="true"
                            />
                            <span className="whitespace-nowrap">{s.confidence} confidence</span>
                          </p>
                          {s.evidence && (
                            <p className="text-dark-500 truncate text-xs" title={s.evidence}>
                              {s.evidence}
                            </p>
                          )}
                        </div>
                        {/* Open link, duration and buttons share one centre line, level with the
                            title (the negative margin centres the 32px buttons on its 20px line) */}
                        <div
                          className={cn('flex shrink-0 items-center gap-2', canEdit && '-my-1.5')}
                        >
                          {s.sourceUrl && (
                            <a
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-dark-400 hover:text-thyme-400"
                              title={`Open in ${sourceLabels[s.source] ?? s.source}`}
                            >
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              <span className="sr-only">
                                Open in {sourceLabels[s.source] ?? s.source}
                              </span>
                            </a>
                          )}
                          <span className="text-dark-200 min-w-[3.5rem] text-right text-sm font-medium">
                            {formatTime(roundToQuarterHour(s.quantity))}
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAdd(s)}
                                disabled={busy || isAddingAll}
                                title={
                                  isQuickAddable(s)
                                    ? 'Add to timesheet'
                                    : 'Choose a project and task, then add'
                                }
                              >
                                <PlusIcon className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Add</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(s)}
                                disabled={busy || isAddingAll}
                                title="Edit before adding"
                                aria-label="Edit before adding"
                              >
                                <PencilSquareIcon className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Edit</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDismiss(s)}
                                disabled={busy || isAddingAll}
                                title="Dismiss this suggestion"
                                aria-label="Dismiss suggestion"
                                className="hover:border-red-500/50 hover:text-red-400"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Edit (or Add without a project/task) - the same modal the grid uses, pre-filled */}
      <TimeEntryModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        date={editing?.date ?? null}
        entry={null}
        weekStart={weekStart}
        prefill={prefill}
        onSaved={handleModalSaved}
      />
    </>
  );
}
