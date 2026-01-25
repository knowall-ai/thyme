'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  UserIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { Card, Button } from '@/components/ui';
import { getUserProfilePhoto } from '@/services/auth/graphService';
import type {
  BCTimeSheet,
  BCTimeSheetLine,
  TimesheetDisplayStatus,
  BCJob,
  BCJobTask,
} from '@/types';
import { cn, getTimesheetDisplayStatus } from '@/utils';

interface ApprovalCardProps {
  timeSheet: BCTimeSheet;
  lines: BCTimeSheetLine[];
  isExpanded: boolean;
  isProcessing: boolean;
  onToggleExpand: () => void;
  onApprove: (comment?: string) => void;
  onReject: (comment: string) => void;
  /** Hide person name when grouped by person (shown in group header) */
  hidePerson?: boolean;
  /** Hide week dates when grouped by week (shown in group header) */
  hideWeek?: boolean;
  /** Resource email for fetching profile photo */
  resourceEmail?: string;
  /** Cache of jobs for displaying job names */
  jobsCache?: Record<string, BCJob>;
  /** Cache of tasks per job for displaying task names */
  tasksCache?: Record<string, BCJobTask[]>;
}

export function ApprovalCard({
  timeSheet,
  lines,
  isExpanded,
  isProcessing,
  onToggleExpand,
  onApprove,
  onReject,
  hidePerson,
  hideWeek,
  resourceEmail,
  jobsCache = {},
  tasksCache = {},
}: ApprovalCardProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Fetch profile photo
  useEffect(() => {
    if (resourceEmail) {
      getUserProfilePhoto(resourceEmail).then(setPhotoUrl);
    }
  }, [resourceEmail]);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  // Calculate totals from lines (more reliable than timeSheet.totalQuantity)
  const totalHours = lines.reduce((sum, line) => sum + (line.totalQuantity || 0), 0);
  const billableHours = lines
    .filter((line) => line.type === 'Job')
    .reduce((sum, line) => sum + (line.totalQuantity || 0), 0);
  const billablePercent = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  // Use timeSheet.totalQuantity as fallback if lines not loaded yet
  const displayHours = totalHours || timeSheet.totalQuantity || 0;

  // Helper to get job name from cache
  const getJobName = (jobNo: string): string => {
    const job = jobsCache[jobNo];
    return job?.description || jobNo;
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
                <span className="text-dark-500">({billablePercent}% billable)</span>
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

        {/* Action buttons - always visible */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
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
            disabled={isProcessing}
            isLoading={isProcessing}
            onClick={handleApprove}
          >
            <CheckIcon className="mr-1 h-4 w-4" />
            Approve
          </Button>
        </div>

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

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-dark-700 border-t">
          {/* Time sheet lines */}
          <div className="divide-dark-700/50 divide-y">
            {lines.length > 0 ? (
              lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{line.description || 'No description'}</p>
                    {line.jobNo && (
                      <p className="text-dark-400 text-xs">
                        {getJobName(line.jobNo)}
                        {line.jobTaskNo && ` / ${getTaskName(line.jobNo, line.jobTaskNo)}`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{line.totalQuantity} hrs</p>
                    <p className="text-dark-400 text-xs">{line.type}</p>
                  </div>
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
                className="border-dark-600 bg-dark-700 placeholder-dark-400 focus:border-thyme-500 focus:ring-thyme-500 w-full rounded-lg border px-3 py-2 text-white focus:ring-1 focus:outline-none"
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
                disabled={!rejectReason.trim() || isProcessing}
                isLoading={isProcessing}
                onClick={handleReject}
              >
                <XMarkIcon className="mr-1 h-4 w-4" />
                Confirm Reject
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
