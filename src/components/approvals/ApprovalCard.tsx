'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  UserIcon,
  CalendarDaysIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Card, Button } from '@/components/ui';
import { resolveResourceIdentity } from '@/services/auth/resourceIdentity';
import type {
  BCTimeSheet,
  BCTimeSheetLine,
  BCTimeSheetDetail,
  TimesheetDisplayStatus,
  BCProject,
  BCJobTask,
} from '@/types';
import {
  cn,
  getTimesheetDisplayStatus,
  decodeBCEnum,
  // Aliased: this component has its own display formatDate
  formatDate as toDateKey,
  formatHours,
  isBillableEntry,
  BILLABLE_RULE_DESCRIPTION,
  DAILY_CAPACITY_HOURS,
  DATE_FORMAT_FULL,
  DATE_FORMAT_DAY_SHORT,
} from '@/utils';
import { buildWeekDailyHours, isOverDailyHours } from './dailyHours';

interface ApprovalCardProps {
  timeSheet: BCTimeSheet;
  lines: BCTimeSheetLine[];
  /** The timesheet's daily hours (undefined until loaded, when the day strip is hidden) */
  details?: BCTimeSheetDetail[];
  isExpanded: boolean;
  isProcessing: boolean;
  /** Disables action buttons when any card is being processed */
  isAnyProcessing?: boolean;
  onToggleExpand: () => void;
  onApprove: (comment?: string) => void;
  onReject: (comment: string) => void;
  onDelete?: () => void;
  /** Hide person name when grouped by person (shown in group header) */
  hidePerson?: boolean;
  /** Hide week dates when grouped by week (shown in group header) */
  hideWeek?: boolean;
  /** Resource email for fetching profile photo */
  resourceEmail?: string;
  /** Cache of projects for displaying project names */
  jobsCache?: Record<string, BCProject>;
  /** Cache of tasks per job for displaying task names */
  tasksCache?: Record<string, BCJobTask[]>;
}

export function ApprovalCard({
  timeSheet,
  lines,
  details,
  isExpanded,
  isProcessing,
  onToggleExpand,
  onApprove,
  onReject,
  onDelete,
  hidePerson,
  hideWeek,
  resourceEmail,
  isAnyProcessing = false,
  jobsCache = {},
  tasksCache = {},
}: ApprovalCardProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Reset local UI state when timesheet is no longer actionable
  useEffect(() => {
    if (!timeSheet.submittedExists) {
      setShowRejectForm(false);
      setShowDeleteConfirm(false);
      setRejectReason('');
    }
  }, [timeSheet.submittedExists]);

  // Fetch profile photo
  useEffect(() => {
    // resourceEmail is the time sheet owner's, who may own several resources' time sheets,
    // so the photo is resolved for the resource itself
    if (!resourceEmail && !timeSheet.resourceName) return;
    let cancelled = false;
    resolveResourceIdentity({ name: timeSheet.resourceName, ownerUserId: resourceEmail }, '').then(
      ({ photoUrl }) => {
        if (!cancelled) setPhotoUrl(photoUrl);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [resourceEmail, timeSheet.resourceName]);

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      // Check for invalid/placeholder dates (year 0001 or 1)
      if (date.getFullYear() <= 1) {
        return 'No date';
      }
      return format(date, DATE_FORMAT_FULL);
    } catch {
      return dateString;
    }
  };

  // Calculate totals from lines (more reliable than timeSheet.totalQuantity)
  const totalHours = lines.reduce((sum, line) => sum + (line.totalQuantity || 0), 0);
  // Projects not in the cache yet are judged on the line's chargeable flag alone
  const billableHours = lines
    .filter(
      (line) =>
        line.type === 'Job' && isBillableEntry(line, line.jobNo ? jobsCache[line.jobNo] : undefined)
    )
    .reduce((sum, line) => sum + (line.totalQuantity || 0), 0);
  const billablePercent = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  // Use timeSheet.totalQuantity as fallback if lines not loaded yet
  const displayHours = totalHours || timeSheet.totalQuantity || 0;

  // Hours per day for the week, overall and per line
  const daily = useMemo(
    () => (details ? buildWeekDailyHours(timeSheet.startingDate, details) : null),
    [details, timeSheet.startingDate]
  );
  const todayKey = toDateKey(new Date());
  const weekDays = (daily?.days ?? []).map((key) => {
    const date = parseISO(key);
    return {
      key,
      date,
      label: format(date, 'EEE d'),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: key === todayKey,
    };
  });
  const showDays = daily !== null && weekDays.length > 0;

  // Helper to get project name from cache
  const getJobName = (jobNo: string): string => {
    const project = jobsCache[jobNo];
    return project?.displayName || jobNo;
  };

  // Helper to get task name from cache
  const getTaskName = (jobNo: string, taskNo: string): string => {
    const tasks = tasksCache[jobNo];
    const task = tasks?.find((t) => t.jobTaskNo === taskNo);
    return task?.description || taskNo;
  };

  const handleApprove = () => {
    onApprove();
  };

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason.trim());
      setRejectReason('');
      setShowRejectForm(false);
    }
  };

  return (
    <Card variant="bordered" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        {/* Employee/Week info */}
        <div className="flex-1">
          {!hidePerson && (
            <div className="flex items-center gap-2">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={timeSheet.resourceName || 'User'}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <UserIcon className="text-dark-400 h-5 w-5" />
              )}
              <span className="font-medium text-white">{timeSheet.resourceName}</span>
            </div>
          )}
          {hidePerson && !hideWeek && (
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="text-thyme-500 h-8 w-8" />
              <span className="font-medium text-white">
                {formatDate(timeSheet.startingDate)} - {formatDate(timeSheet.endingDate)}
              </span>
            </div>
          )}
          <div
            className={cn(
              'text-dark-400 flex items-center gap-4 text-sm',
              (!hidePerson || !hideWeek) && 'mt-1'
            )}
          >
            {!hideWeek && !hidePerson && (
              <span>
                {formatDate(timeSheet.startingDate)} - {formatDate(timeSheet.endingDate)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              {displayHours} hours
              {lines.length > 0 && (
                <span className="text-dark-500" title={BILLABLE_RULE_DESCRIPTION}>
                  ({billablePercent}% billable)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Status badge */}
        {(() => {
          const displayStatus = getTimesheetDisplayStatus(timeSheet);
          return (
            <span
              className={cn(
                'rounded-full px-2 py-1 text-xs font-medium',
                displayStatus === 'Submitted' && 'bg-amber-500/20 text-amber-400',
                displayStatus === 'Partially Submitted' && 'bg-amber-500/20 text-amber-400',
                displayStatus === 'Approved' && 'bg-thyme-500/20 text-thyme-400',
                displayStatus === 'Rejected' && 'bg-red-500/20 text-red-400',
                displayStatus === 'Mixed' && 'bg-blue-500/20 text-blue-400',
                displayStatus === 'Open' && 'bg-dark-500/20 text-dark-400'
              )}
            >
              {displayStatus}
            </span>
          );
        })()}

        {/* Action buttons - only show when there are submitted lines to act on */}
        {timeSheet.submittedExists && (
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isAnyProcessing}
                onClick={() => {
                  setShowDeleteConfirm(true);
                  if (!isExpanded) {
                    onToggleExpand();
                  }
                }}
                title="Delete timesheet"
                aria-label={`Delete timesheet for ${timeSheet.resourceName}`}
                className="text-dark-400 hover:text-red-400"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={isAnyProcessing}
              onClick={() => {
                setShowRejectForm(true);
                if (!isExpanded) {
                  onToggleExpand();
                }
              }}
            >
              <XMarkIcon className="mr-1 h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isAnyProcessing}
              isLoading={isProcessing}
              onClick={handleApprove}
            >
              <CheckIcon className="mr-1 h-4 w-4" />
              Approve
            </Button>
          </div>
        )}

        {/* Expand button */}
        <button
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Collapse timesheet details' : 'Expand timesheet details'}
          aria-expanded={isExpanded}
          className="text-dark-400 hover:bg-dark-700 rounded-lg p-2 hover:text-white"
        >
          {isExpanded ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Hours per day, so the approver can see how the week was spread without expanding */}
      {showDays && (
        <div className="-mt-1 px-4 pb-4">
          <div className="grid max-w-md grid-cols-7 gap-1">
            {weekDays.map((day, i) => {
              const hours = daily.totals[i];
              const isOver = isOverDailyHours(hours);
              return (
                <div
                  key={day.key}
                  title={`${format(day.date, DATE_FORMAT_DAY_SHORT)}: ${formatHours(hours)} hours${
                    isOver ? ` (over ${DAILY_CAPACITY_HOURS})` : ''
                  }`}
                  className={cn(
                    'rounded-md px-1 py-1 text-center',
                    day.isToday ? 'bg-knowall-green/10' : !day.isWeekend && 'bg-dark-700/40',
                    isOver && 'bg-amber-500/10'
                  )}
                >
                  <p
                    className={cn(
                      'text-[10px] leading-tight whitespace-nowrap',
                      day.isToday
                        ? 'text-knowall-green font-medium'
                        : day.isWeekend
                          ? 'text-dark-500'
                          : 'text-dark-400'
                    )}
                  >
                    {day.label}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-xs font-medium tabular-nums',
                      isOver ? 'text-amber-400' : hours > 0 ? 'text-white' : 'text-dark-500'
                    )}
                  >
                    {hours > 0 ? formatHours(hours) : '–'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-dark-700 border-t">
          {/* Day column headings, aligned with each line's hours per day (hidden on small screens) */}
          {showDays && lines.length > 0 && (
            <div className="text-dark-400 hidden items-center gap-4 px-4 pt-3 text-[10px] md:flex">
              <div className="min-w-0 flex-1" />
              <div className="grid w-72 shrink-0 grid-cols-7 text-center">
                {weekDays.map((day) => (
                  <span
                    key={day.key}
                    className={cn(
                      day.isToday && 'text-knowall-green font-medium',
                      day.isWeekend && !day.isToday && 'text-dark-500'
                    )}
                  >
                    {day.label}
                  </span>
                ))}
              </div>
              <div className="w-16 shrink-0 text-right">Total</div>
            </div>
          )}

          {/* Time sheet lines */}
          <div className="divide-dark-700/50 divide-y">
            {lines.length > 0 ? (
              lines.map((line) => (
                <div key={line.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {line.type === 'Job' && line.jobNo ? (
                      <>
                        {/* Project first, so approvers can see where the time went */}
                        <p className="flex items-center gap-2 text-sm text-white">
                          <span className="bg-dark-700 text-dark-300 rounded px-1.5 py-0.5 font-mono text-xs">
                            {line.jobNo}
                          </span>
                          <Link
                            href={`/projects/${line.jobNo}`}
                            className="hover:text-thyme-400 truncate font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {getJobName(line.jobNo)}
                          </Link>
                        </p>
                        <p className="text-dark-400 mt-0.5 text-xs">
                          {/* Task, then description (skipped when it just repeats the task) */}
                          {[
                            ...new Set(
                              [
                                line.jobTaskNo && getTaskName(line.jobNo, line.jobTaskNo),
                                line.description,
                              ].filter(Boolean)
                            ),
                          ].join(' · ') || 'No description'}
                        </p>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-white">
                        <span className="truncate">{line.description || 'No description'}</span>
                        {/* Line type, only when it isn't a normal project (Job) line */}
                        {decodeBCEnum(line.type) !== 'Job' && (
                          <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                            {decodeBCEnum(line.type)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {showDays && (
                    <div className="hidden w-72 shrink-0 grid-cols-7 text-center text-xs tabular-nums md:grid">
                      {weekDays.map((day, i) => {
                        const hours = daily.byLine.get(line.lineNo)?.[i] ?? 0;
                        return (
                          <span
                            key={day.key}
                            className={hours > 0 ? 'text-white' : 'text-dark-500'}
                          >
                            {hours > 0 ? formatHours(hours) : '–'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p className="w-16 shrink-0 text-right text-sm font-medium text-white">
                    {line.totalQuantity} hrs
                  </p>
                </div>
              ))
            ) : (
              <div className="text-dark-400 p-4 text-center">No line details available</div>
            )}
          </div>

          {/* Reject form */}
          {showRejectForm && (
            <div className="border-dark-700 border-t p-4">
              <label className="text-dark-300 mb-2 block text-sm font-medium">
                Rejection reason (required)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please provide a reason for rejection..."
                className="border-dark-600 bg-dark-700 placeholder:text-dark-400 focus:border-thyme-500 focus:ring-thyme-500 w-full rounded-lg border px-3 py-2 text-white focus:ring-1 focus:outline-none"
                rows={3}
              />
            </div>
          )}

          {/* Reject confirmation buttons (only shown when reject form is active) */}
          {showRejectForm && (
            <div className="border-dark-700 flex items-center justify-end gap-2 border-t p-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRejectForm(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!rejectReason.trim() || isAnyProcessing}
                isLoading={isProcessing}
                onClick={handleReject}
              >
                <XMarkIcon className="mr-1 h-4 w-4" />
                Confirm Reject
              </Button>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && onDelete && (
            <div className="border-dark-700 border-t bg-red-500/10 p-4">
              <p className="mb-3 text-sm text-red-400">
                <strong>Are you sure you want to delete this timesheet?</strong>
                <br />
                This action cannot be undone. The timesheet for{' '}
                <span className="font-medium text-white">{timeSheet.resourceName}</span> will be
                permanently removed.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={isAnyProcessing}
                  isLoading={isProcessing}
                  onClick={() => {
                    onDelete();
                    setShowDeleteConfirm(false);
                  }}
                >
                  <TrashIcon className="mr-1 h-4 w-4" />
                  Delete Timesheet
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
