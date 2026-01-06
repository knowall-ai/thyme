'use client';

import { Card } from '@/components/ui';
import { formatTime } from '@/utils';
import type { Project, TimeEntry } from '@/types';

interface ProjectStatsCardsProps {
  project: Project;
  timeEntries: TimeEntry[];
}

export function ProjectStatsCards({ project, timeEntries }: ProjectStatsCardsProps) {
  // Calculate statistics from time entries
  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const billableHours = timeEntries
    .filter((entry) => entry.isBillable)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const nonBillableHours = totalHours - billableHours;

  // Mock budget data - in a real app, this would come from BC
  // BC API limitation: budget data not available via standard API (see issue #41)
  const budgetHours = 100; // Placeholder
  const remainingHours = Math.max(0, budgetHours - totalHours);
  const budgetPercentUsed = budgetHours > 0 ? (totalHours / budgetHours) * 100 : 0;

  // Mock cost data - would come from BC job ledger entries
  const hourlyRate = 125; // Placeholder rate
  const totalCost = totalHours * hourlyRate;
  const billableAmount = billableHours * hourlyRate;

  const stats = [
    {
      label: 'Total hours',
      value: formatTime(totalHours),
      subValues: [
        { label: 'Billable', value: formatTime(billableHours) },
        { label: 'Non-billable', value: formatTime(nonBillableHours) },
      ],
    },
    {
      label: 'Budget remaining',
      value: formatTime(remainingHours),
      progress: {
        current: totalHours,
        total: budgetHours,
        percentage: budgetPercentUsed,
      },
    },
    {
      label: 'Internal costs',
      value: `€${totalCost.toLocaleString('en-IE', { minimumFractionDigits: 2 })}`,
      subValues: [
        {
          label: 'Time',
          value: `€${totalCost.toLocaleString('en-IE', { minimumFractionDigits: 2 })}`,
        },
        { label: 'Expenses', value: '€0.00' },
      ],
    },
    {
      label: 'Billable amount',
      value: `€${billableAmount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} variant="bordered" className="p-4">
          <p className="text-sm text-dark-400">{stat.label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p>

          {/* Sub-values */}
          {stat.subValues && (
            <div className="mt-2 flex gap-4 text-sm">
              {stat.subValues.map((sub) => (
                <div key={sub.label}>
                  <span className="text-dark-400">{sub.label}</span>
                  <span className="ml-2 text-dark-200">{sub.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {stat.progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-dark-400">
                <span>Total budget</span>
                <span>{formatTime(stat.progress.total)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-dark-700">
                <div
                  className="h-full rounded-full bg-thyme-500 transition-all"
                  style={{ width: `${Math.min(100, stat.progress.percentage)}%` }}
                />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
