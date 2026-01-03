'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';
import {
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

type DateRange = 'week' | 'month' | 'custom';

export function ReportsPanel() {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const today = new Date();

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'week':
        return `${format(startOfWeek(today, { weekStartsOn: 1 }), 'MMM d')} - ${format(endOfWeek(today, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
      case 'month':
        return format(today, 'MMMM yyyy');
      default:
        return 'Custom Range';
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <Card variant="bordered" className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-dark-400" />
            <span className="text-dark-100">{getDateRangeLabel()}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'week'
                  ? 'bg-thyme-600 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'month'
                  ? 'bg-thyme-600 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              This Month
            </button>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-thyme-500/20 rounded-lg">
              <ClockIcon className="w-5 h-5 text-thyme-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Total Hours</p>
              <p className="text-xl font-bold text-dark-100">0h</p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <ChartBarIcon className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Billable Hours</p>
              <p className="text-xl font-bold text-dark-100">0h</p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <ChartBarIcon className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Projects</p>
              <p className="text-xl font-bold text-dark-100">0</p>
            </div>
          </div>
        </Card>
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ChartBarIcon className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Billable %</p>
              <p className="text-xl font-bold text-dark-100">0%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Project Breakdown */}
      <Card variant="bordered" className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Hours by Project</h2>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-dark-300 hover:text-white bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors">
            <DocumentArrowDownIcon className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="text-center py-12 text-dark-400">
          <ChartBarIcon className="w-12 h-12 mx-auto mb-4 text-dark-600" />
          <p>No time entries found for this period</p>
          <p className="text-sm mt-1">Start tracking time to see your reports here</p>
        </div>
      </Card>

      {/* Daily Breakdown */}
      <Card variant="bordered" className="p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Daily Breakdown</h2>
        <div className="text-center py-12 text-dark-400">
          <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-dark-600" />
          <p>No time entries found for this period</p>
        </div>
      </Card>
    </div>
  );
}
