'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { CheckIcon, XMarkIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Card, Button, Modal } from '@/components/ui';
import { ApprovalCard } from './ApprovalCard';
import { ApprovalFilters } from './ApprovalFilters';
import { useApprovalStore, useCompanyStore } from '@/hooks';
import type { BCTimeSheet, BCTimeSheetLine } from '@/types';

export function ApprovalList() {
  const { selectedCompany } = useCompanyStore();
  const {
    pendingApprovals,
    selectedTimeSheet,
    selectedLines,
    filters,
    isLoading,
    isProcessing,
    error,
    isApprover,
    permissionChecked,
    pendingCount,
    pendingHours,
    fetchPendingApprovals,
    fetchTimeSheetLines,
    selectTimeSheet,
    setFilters,
    clearFilters,
    approveTimeSheet,
    rejectTimeSheet,
    bulkApprove,
    bulkReject,
    checkApprovalPermission,
  } = useApprovalStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [linesCache, setLinesCache] = useState<Record<string, BCTimeSheetLine[]>>({});

  // Fetch permissions and approvals on mount and when company changes
  // Note: Zustand actions are stable references, but ESLint doesn't know that.
  // We intentionally omit them from deps to avoid infinite re-renders.
  useEffect(() => {
    checkApprovalPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  useEffect(() => {
    if (permissionChecked && isApprover) {
      fetchPendingApprovals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionChecked, isApprover, selectedCompany]);

  // Update lines cache when selectedLines changes
  useEffect(() => {
    if (selectedTimeSheet && selectedLines.length > 0) {
      setLinesCache((prev) => ({
        ...prev,
        [selectedTimeSheet.id]: selectedLines,
      }));
    }
  }, [selectedTimeSheet, selectedLines]);

  const handleToggleExpand = useCallback(
    async (timeSheet: BCTimeSheet) => {
      if (expandedId === timeSheet.id) {
        setExpandedId(null);
        selectTimeSheet(null);
      } else {
        setExpandedId(timeSheet.id);
        selectTimeSheet(timeSheet);
        // Fetch lines if not cached
        if (!linesCache[timeSheet.id]) {
          await fetchTimeSheetLines(timeSheet.number);
        }
      }
    },
    [expandedId, linesCache, fetchTimeSheetLines, selectTimeSheet]
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === pendingApprovals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingApprovals.map((a) => a.id)));
    }
  }, [selectedIds.size, pendingApprovals]);

  const handleApprove = useCallback(
    async (timeSheetId: string, comment?: string) => {
      // Find the timesheet to get employee name for better error messages
      const timeSheet = pendingApprovals.find((a) => a.id === timeSheetId);
      const employeeName = timeSheet?.resourceName || 'Unknown';

      const success = await approveTimeSheet(timeSheetId, comment);
      if (success) {
        toast.success(`Timesheet for ${employeeName} approved`);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(timeSheetId);
          return next;
        });
        if (expandedId === timeSheetId) {
          setExpandedId(null);
        }
      } else {
        toast.error(`Failed to approve timesheet for ${employeeName}`);
      }
    },
    [approveTimeSheet, expandedId, pendingApprovals]
  );

  const handleReject = useCallback(
    async (timeSheetId: string, comment: string) => {
      // Find the timesheet to get employee name for better error messages
      const timeSheet = pendingApprovals.find((a) => a.id === timeSheetId);
      const employeeName = timeSheet?.resourceName || 'Unknown';

      const success = await rejectTimeSheet(timeSheetId, comment);
      if (success) {
        toast.success(`Timesheet for ${employeeName} rejected`);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(timeSheetId);
          return next;
        });
        if (expandedId === timeSheetId) {
          setExpandedId(null);
        }
      } else {
        toast.error(`Failed to reject timesheet for ${employeeName}`);
      }
    },
    [rejectTimeSheet, expandedId, pendingApprovals]
  );

  const handleBulkApprove = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    const success = await bulkApprove(Array.from(selectedIds));
    if (success) {
      toast.success(`${count} timesheet${count > 1 ? 's' : ''} approved`);
      setSelectedIds(new Set());
      setExpandedId(null);
    } else {
      // Error message is set in the store with partial success details
      toast.error(error || 'Failed to approve some timesheets');
    }
  }, [selectedIds, bulkApprove, error]);

  const handleBulkReject = useCallback(async () => {
    if (selectedIds.size === 0 || !bulkRejectReason.trim()) return;

    const count = selectedIds.size;
    const success = await bulkReject(Array.from(selectedIds), bulkRejectReason.trim());
    if (success) {
      toast.success(`${count} timesheet${count > 1 ? 's' : ''} rejected`);
      setSelectedIds(new Set());
      setExpandedId(null);
      setShowBulkRejectModal(false);
      setBulkRejectReason('');
    } else {
      // Error message is set in the store with partial success details
      toast.error(error || 'Failed to reject some timesheets');
    }
  }, [selectedIds, bulkRejectReason, bulkReject, error]);

  // Permission check loading state
  if (!permissionChecked) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  // Not an approver
  if (!isApprover) {
    return (
      <Card variant="bordered" className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dark-700">
          <XMarkIcon className="h-8 w-8 text-dark-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">No Approval Access</h3>
        <p className="mt-2 text-dark-400">
          You don&apos;t have permission to approve timesheets. Contact your administrator if you
          believe this is an error.
        </p>
      </Card>
    );
  }

  // Loading state
  if (isLoading && pendingApprovals.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card variant="bordered" className="p-8 text-center">
        <p className="mb-2 text-red-500">{error}</p>
        <button
          onClick={() => fetchPendingApprovals()}
          className="text-thyme-500 underline hover:text-thyme-400"
        >
          Try again
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Pending Approvals</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{pendingCount}</p>
        </Card>
        <Card variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">Total Hours Pending</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-dark-100">
            <ClockIcon className="h-6 w-6" />
            {pendingHours.toFixed(1)}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <ApprovalFilters
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={clearFilters}
      />

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-thyme-600/30 bg-thyme-900/20 p-4">
          <span className="text-sm text-dark-300">
            {selectedIds.size} timesheet{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={() => setShowBulkRejectModal(true)}
          >
            <XMarkIcon className="mr-1 h-4 w-4" />
            Reject Selected
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isProcessing}
            isLoading={isProcessing}
            onClick={handleBulkApprove}
          >
            <CheckIcon className="mr-1 h-4 w-4" />
            Approve Selected
          </Button>
        </div>
      )}

      {/* Approval list */}
      {pendingApprovals.length > 0 ? (
        <div className="space-y-4">
          {/* Select all checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="approval-select-all"
              type="checkbox"
              checked={selectedIds.size === pendingApprovals.length && pendingApprovals.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-dark-600 bg-dark-700 text-thyme-500 focus:ring-thyme-500"
            />
            <label htmlFor="approval-select-all" className="text-sm text-dark-400">
              Select all
            </label>
          </div>

          {/* Approval cards */}
          {pendingApprovals.map((timeSheet) => (
            <ApprovalCard
              key={timeSheet.id}
              timeSheet={timeSheet}
              lines={linesCache[timeSheet.id] || []}
              isExpanded={expandedId === timeSheet.id}
              isProcessing={isProcessing}
              isSelected={selectedIds.has(timeSheet.id)}
              onToggleExpand={() => handleToggleExpand(timeSheet)}
              onToggleSelect={() => handleToggleSelect(timeSheet.id)}
              onApprove={(comment) => handleApprove(timeSheet.id, comment)}
              onReject={(comment) => handleReject(timeSheet.id, comment)}
            />
          ))}
        </div>
      ) : (
        <Card variant="bordered" className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-thyme-500/20">
            <CheckIcon className="h-8 w-8 text-thyme-500" />
          </div>
          <h3 className="text-lg font-semibold text-white">All Caught Up!</h3>
          <p className="mt-2 text-dark-400">There are no timesheets pending your approval.</p>
        </Card>
      )}

      {/* Bulk reject modal */}
      <Modal
        isOpen={showBulkRejectModal}
        onClose={() => {
          setShowBulkRejectModal(false);
          setBulkRejectReason('');
        }}
        title={`Reject ${selectedIds.size} Timesheet${selectedIds.size > 1 ? 's' : ''}`}
      >
        <div className="space-y-4">
          <p className="text-dark-300">
            Please provide a reason for rejecting the selected timesheets. This will be sent to the
            employees.
          </p>
          <textarea
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            placeholder="Rejection reason..."
            className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-white placeholder-dark-400 focus:border-thyme-500 focus:outline-none focus:ring-1 focus:ring-thyme-500"
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowBulkRejectModal(false);
                setBulkRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!bulkRejectReason.trim() || isProcessing}
              isLoading={isProcessing}
              onClick={handleBulkReject}
            >
              Reject Timesheets
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
