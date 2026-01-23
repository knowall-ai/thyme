'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Card, Button } from '@/components/ui';
import type { BCTimeSheet, BCTimeSheetLine, TimesheetDisplayStatus } from '@/types';
import { cn } from '@/utils';

/**
 * Derive a display-friendly status from timesheet FlowFields.
 */
function getTimesheetDisplayStatus(timesheet: BCTimeSheet): TimesheetDisplayStatus {
  const { openExists, submittedExists, rejectedExists, approvedExists } = timesheet;

  // All approved, nothing else
  if (approvedExists && !openExists && !submittedExists && !rejectedExists) {
    return 'Approved';
  }
  // Any rejected
  if (rejectedExists) {
    return 'Rejected';
  }
  // All submitted, nothing open
  if (submittedExists && !openExists) {
    return 'Submitted';
  }
  // Some submitted, some open
  if (submittedExists && openExists) {
    return 'Partially Submitted';
  }
  // Mix of approved and other states
  if (approvedExists && (openExists || submittedExists)) {
    return 'Mixed';
  }
  // Default to Open
  return 'Open';
}

interface ApprovalCardProps {
  timeSheet: BCTimeSheet;
  lines: BCTimeSheetLine[];
  isExpanded: boolean;
  isProcessing: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onApprove: (comment?: string) => void;
  onReject: (comment: string) => void;
}

export function ApprovalCard({
  timeSheet,
  lines,
  isExpanded,
  isProcessing,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
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
        {/* Checkbox for bulk selection */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select timesheet for ${timeSheet.resourceName}`}
          className="h-4 w-4 rounded border-dark-600 bg-dark-700 text-thyme-500 focus:ring-thyme-500"
        />

        {/* Employee info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-dark-400" />
            <span className="font-medium text-white">{timeSheet.resourceName}</span>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-dark-400">
            <span>
              {formatDate(timeSheet.startingDate)} - {formatDate(timeSheet.endingDate)}
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              {timeSheet.totalQuantity} hours
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

        {/* Expand button */}
        <button
          onClick={onToggleExpand}
          aria-label={isExpanded ? 'Collapse timesheet details' : 'Expand timesheet details'}
          aria-expanded={isExpanded}
          className="rounded-lg p-2 text-dark-400 hover:bg-dark-700 hover:text-white"
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
        <div className="border-t border-dark-700">
          {/* Time sheet lines */}
          <div className="divide-y divide-dark-700/50">
            {lines.length > 0 ? (
              lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{line.description || 'No description'}</p>
                    {line.jobNo && (
                      <p className="text-xs text-dark-400">
                        Project: {line.jobNo}
                        {line.jobTaskNo && ` / Task: ${line.jobTaskNo}`}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{line.totalQuantity} hrs</p>
                    <p className="text-xs text-dark-400">{line.type}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-dark-400">No line details available</div>
            )}
          </div>

          {/* Reject form */}
          {showRejectForm && (
            <div className="border-t border-dark-700 p-4">
              <label className="mb-2 block text-sm font-medium text-dark-300">
                Rejection reason (required)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please provide a reason for rejection..."
                className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-white placeholder-dark-400 focus:border-thyme-500 focus:outline-none focus:ring-1 focus:ring-thyme-500"
                rows={3}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-dark-700 p-4">
            {showRejectForm ? (
              <>
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
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => setShowRejectForm(true)}
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
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
