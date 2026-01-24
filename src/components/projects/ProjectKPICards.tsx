'use client';

import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import {
  ClockIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

export function ProjectKPICards() {
  const { analytics, isLoadingAnalytics } = useProjectDetailsStore();

  if (isLoadingAnalytics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} variant="bordered" className="animate-pulse p-4">
            <div className="h-20 rounded bg-dark-600" />
          </Card>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      label: 'Total Hours',
      value: analytics?.totalHours.toFixed(1) ?? '0',
      subLabel: analytics
        ? `${analytics.billableHours.toFixed(1)}h billable / ${analytics.nonBillableHours.toFixed(1)}h non-billable`
        : 'No data',
      icon: ClockIcon,
      color: 'text-thyme-400',
    },
    {
      label: 'Budget Remaining',
      value: 'N/A',
      subLabel: 'Budget data not available',
      icon: CurrencyDollarIcon,
      color: 'text-amber-400',
    },
    {
      label: 'Hours This Week',
      value: analytics?.hoursThisWeek.toFixed(1) ?? '0',
      subLabel: 'Current week',
      icon: CalendarDaysIcon,
      color: 'text-blue-400',
    },
    {
      label: 'Team Members',
      value: analytics?.teamMemberCount.toString() ?? '0',
      subLabel: 'Active on project',
      icon: UserGroupIcon,
      color: 'text-purple-400',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} variant="bordered" className="p-4">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg bg-dark-600 p-2 ${kpi.color}`}>
              <kpi.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">{kpi.label}</p>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
              <p className="mt-1 text-xs text-gray-500">{kpi.subLabel}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
