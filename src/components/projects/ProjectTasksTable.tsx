'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { ChevronDownIcon, ChevronRightIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils';
import { formatTime } from '@/utils';
import type { Project, Task, TimeEntry, BCTimeEntry } from '@/types';

interface ProjectTasksTableProps {
  project: Project;
  timeEntries: TimeEntry[];
  bcTimeEntries?: BCTimeEntry[];
  hasRealTimeData?: boolean;
}

type GroupBy = 'task' | 'team';

interface UserStats {
  userId: string;
  hours: number;
  totalCost: number;
  totalPrice: number;
}

interface TaskStats {
  task: Task;
  hours: number;
  billableAmount: number;
  costs: number;
  entries: TimeEntry[];
  userBreakdown: UserStats[];
}

export function ProjectTasksTable({
  project,
  timeEntries,
  bcTimeEntries = [],
  hasRealTimeData = false,
}: ProjectTasksTableProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('task');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month'>('all');

  // Fallback hourly rate when BC data not available
  const fallbackHourlyRate = 125;

  // Calculate task statistics
  const taskStats = useMemo((): TaskStats[] => {
    return project.tasks.map((task) => {
      // Filter entries by task code (taskId might be task code for BC entries)
      const taskEntries = timeEntries.filter((e) => e.taskId === task.id || e.taskId === task.code);
      const hours = taskEntries.reduce((sum, e) => sum + e.hours, 0);

      // Group by user with cost data
      const userMap = new Map<string, UserStats>();
      taskEntries.forEach((entry) => {
        const existing = userMap.get(entry.userId) || {
          userId: entry.userId,
          hours: 0,
          totalCost: 0,
          totalPrice: 0,
        };
        existing.hours += entry.hours;
        existing.totalCost += entry.totalCost || entry.hours * fallbackHourlyRate * 0.6;
        existing.totalPrice +=
          entry.totalPrice || (task.isBillable ? entry.hours * fallbackHourlyRate : 0);
        userMap.set(entry.userId, existing);
      });

      const userBreakdown = Array.from(userMap.values());

      // Calculate totals - use real BC data if available
      let billableAmount: number;
      let costs: number;

      if (hasRealTimeData) {
        billableAmount = userBreakdown.reduce((sum, u) => sum + u.totalPrice, 0);
        costs = userBreakdown.reduce((sum, u) => sum + u.totalCost, 0);
      } else {
        billableAmount = task.isBillable ? hours * fallbackHourlyRate : 0;
        costs = hours * (fallbackHourlyRate * 0.6);
      }

      return {
        task,
        hours,
        billableAmount,
        costs,
        entries: taskEntries,
        userBreakdown,
      };
    });
  }, [project.tasks, timeEntries, hasRealTimeData]);

  // Calculate totals
  const totals = useMemo(() => {
    const billableStats = taskStats.filter((s) => s.task.isBillable);
    const nonBillableStats = taskStats.filter((s) => !s.task.isBillable);

    return {
      billable: {
        hours: billableStats.reduce((sum, s) => sum + s.hours, 0),
        amount: billableStats.reduce((sum, s) => sum + s.billableAmount, 0),
        costs: billableStats.reduce((sum, s) => sum + s.costs, 0),
      },
      nonBillable: {
        hours: nonBillableStats.reduce((sum, s) => sum + s.hours, 0),
        amount: 0,
        costs: nonBillableStats.reduce((sum, s) => sum + s.costs, 0),
      },
      total: {
        hours: taskStats.reduce((sum, s) => sum + s.hours, 0),
        amount: taskStats.reduce((sum, s) => sum + s.billableAmount, 0),
        costs: taskStats.reduce((sum, s) => sum + s.costs, 0),
      },
    };
  }, [taskStats]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const billableTasks = taskStats.filter((s) => s.task.isBillable);
  const nonBillableTasks = taskStats.filter((s) => !s.task.isBillable);

  return (
    <Card variant="bordered">
      <CardHeader className="flex items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={() => setGroupBy('task')}
            className={cn(
              'text-sm font-medium transition-colors',
              groupBy === 'task' ? 'text-white' : 'text-dark-400 hover:text-white'
            )}
          >
            Tasks
          </button>
          <button
            onClick={() => setGroupBy('team')}
            className={cn(
              'text-sm font-medium transition-colors',
              groupBy === 'team' ? 'text-white' : 'text-dark-400 hover:text-white'
            )}
          >
            Team
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="rounded-lg border border-dark-700 bg-dark-800 px-3 py-1.5 text-sm text-white focus:border-thyme-500 focus:outline-none"
          >
            <option value="all">All time</option>
            <option value="month">This month</option>
            <option value="week">This week</option>
          </select>

          <button className="rounded-lg border border-dark-700 bg-dark-800 px-3 py-1.5 text-sm text-white hover:bg-dark-700">
            Export
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700 text-left text-sm text-dark-400">
              <th className="px-6 py-3 font-medium">
                {groupBy === 'task' ? 'Billable tasks' : 'Team member'}
              </th>
              <th className="px-6 py-3 text-right font-medium">Hours</th>
              <th className="px-6 py-3 text-right font-medium">Billable amount</th>
              <th className="px-6 py-3 text-right font-medium">Costs</th>
            </tr>
          </thead>
          <tbody>
            {/* Billable tasks section */}
            {billableTasks.map((stat) => (
              <>
                <tr
                  key={stat.task.id}
                  className="border-b border-dark-700/50 transition-colors hover:bg-dark-700/30"
                >
                  <td className="px-6 py-3">
                    <button
                      onClick={() => toggleRow(stat.task.id)}
                      className="flex items-center gap-2 text-white"
                    >
                      {expandedRows.has(stat.task.id) ? (
                        <ChevronDownIcon className="h-4 w-4 text-dark-400" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-dark-400" />
                      )}
                      {stat.task.name}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-thyme-400">{formatTime(stat.hours)}</span>
                  </td>
                  <td className="px-6 py-3 text-right text-white">
                    €{stat.billableAmount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3 text-right text-dark-400">
                    €{stat.costs.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Expanded user breakdown */}
                {expandedRows.has(stat.task.id) &&
                  stat.userBreakdown.map((user) => (
                    <tr
                      key={`${stat.task.id}-${user.userId}`}
                      className="border-b border-dark-700/30 bg-dark-900/50"
                    >
                      <td className="py-2 pl-14 pr-6">
                        <div className="flex items-center gap-2 text-dark-300">
                          <UserCircleIcon className="h-5 w-5 text-dark-500" />
                          <span className="text-sm">{user.userId || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-2 text-right text-dark-400">
                        {formatTime(user.hours)}
                      </td>
                      <td className="px-6 py-2 text-right text-dark-400">
                        €{user.totalPrice.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-2 text-right text-dark-500">
                        €{user.totalCost.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
              </>
            ))}

            {/* Billable total */}
            {billableTasks.length > 0 && (
              <tr className="border-b border-dark-700 bg-dark-800/50 font-medium">
                <td className="px-6 py-3 text-white">Total</td>
                <td className="px-6 py-3 text-right text-white">
                  {formatTime(totals.billable.hours)}
                </td>
                <td className="px-6 py-3 text-right text-white">
                  €{totals.billable.amount.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-3 text-right text-dark-400">
                  €{totals.billable.costs.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Non-billable section header */}
            {nonBillableTasks.length > 0 && (
              <tr className="border-b border-dark-700">
                <th
                  colSpan={4}
                  className="px-6 py-3 pt-6 text-left text-sm font-medium text-dark-400"
                >
                  Non-billable tasks
                </th>
              </tr>
            )}

            {/* Non-billable tasks */}
            {nonBillableTasks.map((stat) => (
              <>
                <tr
                  key={stat.task.id}
                  className="border-b border-dark-700/50 transition-colors hover:bg-dark-700/30"
                >
                  <td className="px-6 py-3">
                    <button
                      onClick={() => toggleRow(stat.task.id)}
                      className="flex items-center gap-2 text-white"
                    >
                      {expandedRows.has(stat.task.id) ? (
                        <ChevronDownIcon className="h-4 w-4 text-dark-400" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 text-dark-400" />
                      )}
                      {stat.task.name}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-dark-400">{formatTime(stat.hours)}</span>
                  </td>
                  <td className="px-6 py-3 text-right text-dark-500">€0.00</td>
                  <td className="px-6 py-3 text-right text-dark-400">
                    €{stat.costs.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Expanded user breakdown */}
                {expandedRows.has(stat.task.id) &&
                  stat.userBreakdown.map((user) => (
                    <tr
                      key={`${stat.task.id}-${user.userId}`}
                      className="border-b border-dark-700/30 bg-dark-900/50"
                    >
                      <td className="py-2 pl-14 pr-6">
                        <div className="flex items-center gap-2 text-dark-300">
                          <UserCircleIcon className="h-5 w-5 text-dark-500" />
                          <span className="text-sm">{user.userId || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-2 text-right text-dark-500">
                        {formatTime(user.hours)}
                      </td>
                      <td className="px-6 py-2 text-right text-dark-500">€0.00</td>
                      <td className="px-6 py-2 text-right text-dark-500">
                        €{user.totalCost.toLocaleString('en-IE', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
              </>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {taskStats.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-dark-400">No tasks found for this project</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
