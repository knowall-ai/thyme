'use client';

import { useMemo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Select, DatePicker } from '@/components/ui';
import type {
  ApprovalFilters as FilterType,
  BCTimeSheet,
  SelectOption,
  TimesheetDisplayStatus,
} from '@/types';

interface ApprovalFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  onClearFilters: () => void;
  /** All timesheets (unfiltered) to derive resource options from */
  allTimesheets: BCTimeSheet[];
}

export function ApprovalFilters({
  filters,
  onFilterChange,
  onClearFilters,
  allTimesheets,
}: ApprovalFiltersProps) {
  // Derive unique resources from the timesheets
  const resourceOptions: SelectOption[] = useMemo(() => {
    const resourceMap = new Map<string, string>();
    allTimesheets.forEach((ts) => {
      if (ts.resourceNo && !resourceMap.has(ts.resourceNo)) {
        resourceMap.set(ts.resourceNo, ts.resourceName || ts.resourceNo);
      }
    });
    const options = Array.from(resourceMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: '', label: 'All Resources' }, ...options];
  }, [allTimesheets]);

  const statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    { value: 'Submitted', label: 'Submitted' },
    { value: 'Partially Submitted', label: 'Partially Submitted' },
    { value: 'Open', label: 'Open' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Mixed', label: 'Mixed' },
  ];

  const hasActiveFilters =
    filters.resourceId || filters.startDate || filters.endDate || filters.status;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Resource filter */}
      <div className="min-w-[160px]">
        <label className="text-dark-400 mb-1 block text-xs font-medium">Resource</label>
        <Select
          options={resourceOptions}
          value={filters.resourceId || ''}
          onChange={(e) => onFilterChange({ resourceId: e.target.value || undefined })}
        />
      </div>

      {/* Status filter */}
      <div className="min-w-[160px]">
        <label className="text-dark-400 mb-1 block text-xs font-medium">Status</label>
        <Select
          options={statusOptions}
          value={filters.status || ''}
          onChange={(e) =>
            onFilterChange({
              status: (e.target.value as TimesheetDisplayStatus) || undefined,
            })
          }
        />
      </div>

      {/* Start date filter */}
      <div className="min-w-[140px]">
        <label className="text-dark-400 mb-1 block text-xs font-medium">From</label>
        <DatePicker
          selectedDate={filters.startDate ? new Date(filters.startDate) : undefined}
          onDateSelect={(date: Date) =>
            onFilterChange({
              startDate: date.toISOString().split('T')[0],
            })
          }
        />
      </div>

      {/* End date filter */}
      <div className="min-w-[140px]">
        <label className="text-dark-400 mb-1 block text-xs font-medium">To</label>
        <DatePicker
          selectedDate={filters.endDate ? new Date(filters.endDate) : undefined}
          onDateSelect={(date: Date) =>
            onFilterChange({
              endDate: date.toISOString().split('T')[0],
            })
          }
        />
      </div>

      {/* Clear filters button */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="mb-0.5">
          <XMarkIcon className="mr-1 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
