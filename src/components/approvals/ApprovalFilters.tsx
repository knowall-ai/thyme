'use client';

import { useState, useEffect } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button, Select, DatePicker } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import type { ApprovalFilters as FilterType, BCEmployee, SelectOption } from '@/types';

interface ApprovalFiltersProps {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  onClearFilters: () => void;
}

export function ApprovalFilters({ filters, onFilterChange, onClearFilters }: ApprovalFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [employees, setEmployees] = useState<BCEmployee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  useEffect(() => {
    async function fetchEmployees() {
      setIsLoadingEmployees(true);
      try {
        const data = await bcClient.getEmployees("status eq 'Active'");
        setEmployees(data);
      } catch (error) {
        console.error('Failed to fetch employees:', error);
      } finally {
        setIsLoadingEmployees(false);
      }
    }
    fetchEmployees();
  }, []);

  const employeeOptions: SelectOption[] = [
    { value: '', label: 'All Employees' },
    ...employees.map((emp) => ({
      value: emp.number,
      label: emp.displayName,
    })),
  ];

  const hasActiveFilters =
    filters.employeeId || filters.startDate || filters.endDate || filters.projectId;

  return (
    <div className="space-y-4">
      {/* Filter toggle button */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2"
        >
          <FunnelIcon className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-thyme-500 px-1.5 py-0.5 text-xs font-medium text-dark-900">
              Active
            </span>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <XMarkIcon className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter controls */}
      {isExpanded && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-dark-700 bg-dark-800/50 p-4 md:grid-cols-3">
          {/* Employee filter */}
          <div>
            <label className="mb-1 block text-sm font-medium text-dark-300">Employee</label>
            <Select
              options={employeeOptions}
              value={filters.employeeId || ''}
              onChange={(e) => onFilterChange({ employeeId: e.target.value || undefined })}
              disabled={isLoadingEmployees}
            />
          </div>

          {/* Start date filter */}
          <div>
            <label className="mb-1 block text-sm font-medium text-dark-300">From Date</label>
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
          <div>
            <label className="mb-1 block text-sm font-medium text-dark-300">To Date</label>
            <DatePicker
              selectedDate={filters.endDate ? new Date(filters.endDate) : undefined}
              onDateSelect={(date: Date) =>
                onFilterChange({
                  endDate: date.toISOString().split('T')[0],
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
