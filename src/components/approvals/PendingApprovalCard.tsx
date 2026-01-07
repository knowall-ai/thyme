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
  useEffect(() => {
    checkApprovalPermission();
  }, [selectedCompany, checkApprovalPermission]);

  // Refresh stats when user is an approver
  useEffect(() => {
    if (permissionChecked && isApprover) {
      refreshStats();
    }
  }, [permissionChecked, isApprover, selectedCompany, refreshStats]);

  // Don't show if not an approver or still checking
  if (!permissionChecked || !isApprover) {
    return null;
  }

  return (
    <Link href="/approvals">
      <Card
        variant="bordered"
        className="hover:bg-dark-750 group cursor-pointer p-4 transition-all hover:border-thyme-600/50"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dark-400">Pending Approvals</p>
            <p className="mt-1 text-2xl font-bold text-amber-500">{pendingCount}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm text-dark-400">
              <ClockIcon className="h-4 w-4" />
              <span>{pendingHours.toFixed(1)} hrs</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-thyme-500 opacity-0 transition-opacity group-hover:opacity-100">
              <span>View all</span>
              <ArrowRightIcon className="h-3 w-3" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
