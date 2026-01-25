'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ClockIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Card } from '@/components/ui';
import { useApprovalStore, useCompanyStore } from '@/hooks';

export function PendingApprovalCard() {
  const { selectedCompany } = useCompanyStore();
  const {
    pendingCount,
    pendingHours,
    isApprover,
    permissionChecked,
    checkApprovalPermission,
    refreshStats,
  } = useApprovalStore();

  // Check permissions on mount and when company changes
  // Note: Zustand actions are stable references, but ESLint doesn't know that.
  // We intentionally omit them from deps to avoid infinite re-renders.
  useEffect(() => {
    checkApprovalPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany]);

  // Refresh stats when user is an approver
  useEffect(() => {
    if (permissionChecked && isApprover) {
      refreshStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionChecked, isApprover, selectedCompany]);

  // Don't show if not an approver or still checking
  if (!permissionChecked || !isApprover) {
    return null;
  }

  return (
    <Link href="/approvals">
      <Card
        variant="bordered"
        className="hover:bg-dark-750 group hover:border-thyme-600/50 cursor-pointer p-4 transition-all"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-dark-400 text-sm">Pending Approvals</p>
            <p className="mt-1 text-2xl font-bold text-amber-500">{pendingCount}</p>
          </div>
          <div className="text-right">
            <div className="text-dark-400 flex items-center gap-1 text-sm">
              <ClockIcon className="h-4 w-4" />
              <span>{pendingHours.toFixed(1)} hrs</span>
            </div>
            <div className="text-thyme-500 mt-2 flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
              <span>View all</span>
              <ArrowRightIcon className="h-3 w-3" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
