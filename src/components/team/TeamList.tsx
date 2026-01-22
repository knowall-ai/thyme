'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { Card, WeekNavigation } from '@/components/ui';
import { bcClient } from '@/services/bc/bcClient';
import { timeEntryService } from '@/services/bc/timeEntryService';
import { useCompanyStore } from '@/hooks';
import { getWeekStart } from '@/utils';
import { cn } from '@/utils';
import type { BCEmployee } from '@/types';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  capacity: number;
  utilization: number; // percentage
  billablePercent: number; // percentage of total hours that are billable
}

type SortField = 'name' | 'totalHours' | 'utilization' | 'billablePercent';
type SortDirection = 'asc' | 'desc';

export function TeamList() {
  const { selectedCompany } = useCompanyStore();
  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Week navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Navigation handlers
  const handlePrevious = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const handleToday = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  const handleDateSelect = (date: Date) => {
    setCurrentWeekStart(getWeekStart(date));
  };

  // Fetch employees and their hours when company or week changes
  useEffect(() => {
    async function fetchTeamData() {
      setIsLoading(true);
      setError(null);
      try {
        const employees = await bcClient.getEmployees("status eq 'Active'");

        // Fetch hours for each employee for the selected week
        const membersWithHours = await Promise.all(
          employees.map(async (employee) => {
            const capacity = 40; // Default capacity - could come from settings
            let totalHours = 0;
            let billableHours = 0;

            try {
              // Get timesheet entries for this employee
              const entries = await timeEntryService.getTeammateEntries(
                currentWeekStart,
                employee
              );

              totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
              billableHours = entries
                .filter((e) => e.isBillable)
                .reduce((sum, e) => sum + e.hours, 0);
            } catch {
              // Employee might not have a timesheet - that's OK
            }

            const nonBillableHours = totalHours - billableHours;
            const utilization = capacity > 0 ? (totalHours / capacity) * 100 : 0;
            const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

            return {
              id: employee.id,
              name: employee.displayName,
              email: employee.email || '',
              role: employee.jobTitle || 'Team Member',
              totalHours,
              billableHours,
              nonBillableHours,
              capacity,
              utilization,
              billablePercent,
            };
          })
        );

        setMembers(membersWithHours);
      } catch {
        setError('Failed to load team members');
        toast.error('Failed to load team members. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchTeamData();
  }, [selectedCompany, currentWeekStart]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalHours = members.reduce((sum, m) => sum + m.totalHours, 0);
    const billableHours = members.reduce((sum, m) => sum + m.billableHours, 0);
    const nonBillableHours = members.reduce((sum, m) => sum + m.nonBillableHours, 0);
    const totalCapacity = members.reduce((sum, m) => sum + m.capacity, 0);
    const utilization = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;

    return { totalHours, billableHours, nonBillableHours, totalCapacity, utilization };
  }, [members]);

  // Pie chart data
  const pieData = {
    labels: ['Billable', 'Non-billable'],
    datasets: [
      {
        data: [totals.billableHours, totals.nonBillableHours],
        backgroundColor: ['#22c55e', '#64748b'],
        borderColor: ['#16a34a', '#475569'],
        borderWidth: 1,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // We use our own custom legend
      },
      tooltip: {
        enabled: totals.totalHours > 0,
      },
    },
  };

  // Show placeholder data when there are no hours
  const hasData = totals.totalHours > 0;
  const displayPieData = hasData
    ? pieData
    : {
        labels: ['No data'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#374151'],
            borderColor: ['#4b5563'],
            borderWidth: 1,
          },
        ],
      };

  // Sorting and filtering
  const filteredAndSortedMembers = useMemo(() => {
    let result = [...members];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.email.toLowerCase().includes(query) ||
          m.role.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'totalHours':
          comparison = a.totalHours - b.totalHours;
          break;
        case 'utilization':
          comparison = a.utilization - b.utilization;
          break;
        case 'billablePercent':
          comparison = a.billablePercent - b.billablePercent;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [members, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4" />
    ) : (
      <ChevronDownIcon className="h-4 w-4" />
    );
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-knowall-green underline hover:text-knowall-green-light"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <WeekNavigation
        currentWeekStart={currentWeekStart}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToday={handleToday}
        onDateSelect={handleDateSelect}
      />

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-knowall-green"></div>
        </div>
      ) : (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {/* Total Hours */}
            <Card variant="bordered" className="p-4">
              <p className="text-sm text-dark-400">Total Hours</p>
              <p className="mt-1 text-2xl font-bold text-dark-100">
                {totals.totalHours.toFixed(1)}
              </p>
            </Card>

            {/* Team Capacity */}
            <Card variant="bordered" className="p-4">
              <p className="text-sm text-dark-400">Team Capacity</p>
              <p className="mt-1 text-2xl font-bold text-dark-100">
                {totals.totalCapacity.toFixed(1)}
              </p>
            </Card>

            {/* Utilization */}
            <Card variant="bordered" className="p-4">
              <p className="text-sm text-dark-400">Utilization</p>
              <p className="mt-1 text-2xl font-bold text-dark-100">
                {totals.utilization.toFixed(0)}%
              </p>
            </Card>

            {/* Pie Chart */}
            <Card variant="bordered" className="p-4">
              <p className="mb-2 text-sm text-dark-400">Hours Breakdown</p>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0">
                  <Pie data={displayPieData} options={pieOptions} />
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-green-500"></span>
                    <span className="text-dark-300">Billable: {totals.billableHours.toFixed(1)}h</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-slate-500"></span>
                    <span className="text-dark-300">Non-billable: {totals.nonBillableHours.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-dark-600 bg-dark-800 py-2 pl-10 pr-4 text-dark-100 placeholder:text-dark-500 focus:border-knowall-green focus:outline-none focus:ring-1 focus:ring-knowall-green"
            />
          </div>

          {/* Team Members Table */}
          <Card variant="bordered" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700 bg-dark-800/50">
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-medium text-dark-300 hover:text-dark-100"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        Employee
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-dark-300">
                      Role
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-medium text-dark-300 hover:text-dark-100"
                      onClick={() => handleSort('totalHours')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Hours
                        <SortIcon field="totalHours" />
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-medium text-dark-300 hover:text-dark-100"
                      onClick={() => handleSort('utilization')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Utilization
                        <SortIcon field="utilization" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-dark-300">
                      Capacity
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-medium text-dark-300 hover:text-dark-100"
                      onClick={() => handleSort('billablePercent')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Billable %
                        <SortIcon field="billablePercent" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-dark-700 last:border-b-0 hover:bg-dark-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-dark-600 text-sm font-medium text-dark-200">
                            {member.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-dark-100">{member.name}</p>
                            <p className="text-xs text-dark-400">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-dark-300">{member.role}</td>
                      <td className="px-4 py-3 text-right text-dark-100">
                        {member.totalHours.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-dark-700">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                member.utilization >= 80
                                  ? 'bg-green-500'
                                  : member.utilization >= 50
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              )}
                              style={{ width: `${Math.min(member.utilization, 100)}%` }}
                            />
                          </div>
                          <span className="w-12 text-dark-100">
                            {member.utilization.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-dark-300">
                        {member.capacity.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            member.billablePercent >= 70
                              ? 'bg-green-500/20 text-green-400'
                              : member.billablePercent >= 50
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-slate-500/20 text-slate-400'
                          )}
                        >
                          {member.billablePercent.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredAndSortedMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-dark-400">
                        {searchQuery
                          ? 'No team members match your search'
                          : 'No team members found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
