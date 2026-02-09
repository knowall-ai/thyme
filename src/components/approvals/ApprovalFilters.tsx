'use client';

import { useMemo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Select, DatePicker } from '@/components/ui';
import type {
  ApprovalFilters as FilterType,
  BCTimeSheet,
  BCResource,
  SelectOption,
  TimesheetDisplayStatus,
} from '@/types';
import { getTimesheetDisplayStatus } from '@/utils';

interface ApprovalFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  onClearFilters: () => void;
  /** All timesheets (unfiltered) - used for fallback if resources not available */
  allTimesheets: BCTimeSheet[];
  /** Resources fetched directly from BC - preferred source for dropdown */
  resources: BCResource[];
}

export function ApprovalFilters({
  filters,
  onFilterChange,
  onClearFilters,
  allTimesheets,
  resources,
}: ApprovalFiltersProps) {
  // Build resource options from resources (preferred) or fall back to timesheets
  const resourceOptions: SelectOption[] = useMemo(() => {
    const resourceMap = new Map<string, string>();

    // Primary source: resources fetched directly from BC
    if (Array.isArray(resources) && resources.length > 0) {
      resources.forEach((r) => {
        if (r?.number && !resourceMap.has(r.number)) {
          resourceMap.set(r.number, r.name || r.number);
        }
      });
    }
    // Fallback: derive from timesheets if no resources available
    else if (Array.isArray(allTimesheets) && allTimesheets.length > 0) {
      allTimesheets.forEach((ts) => {
        const resourceNo = ts?.resourceNo;
        if (resourceNo && !resourceMap.has(resourceNo)) {
          resourceMap.set(resourceNo, ts.resourceName || resourceNo);
        }
      });
    }

    const options = Array.from(resourceMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: '', label: 'All Resources' }, ...options];
  }, [resources, allTimesheets]);

  // Build status options dynamically from actual timesheet data
  const statusOptions: SelectOption[] = useMemo(() => {
    const uniqueStatuses = new Set<TimesheetDisplayStatus>();

    if (Array.isArray(allTimesheets) && allTimesheets.length > 0) {
      allTimesheets.forEach((ts) => {
        const status = getTimesheetDisplayStatus(ts);
        uniqueStatuses.add(status);
      });
    }

    const options = Array.from(uniqueStatuses)
      .sort((a, b) => a.localeCompare(b))
      .map((status) => ({ value: status, label: status }));

    return [{ value: '', label: 'All Statuses' }, ...options];
  }, [allTimesheets]);

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
