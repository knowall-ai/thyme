'use client';

import { useState } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn } from '@/utils';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

type GroupBy = 'task' | 'team';

interface ExpandedState {
  [key: string]: boolean;
}

export function ProjectTasksTable() {
  const { analytics, tasks, isLoadingAnalytics } = useProjectDetailsStore();
  const [groupBy, setGroupBy] = useState<GroupBy>('task');
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoadingAnalytics) {
    return (
      <Card variant="bordered" className="p-6">
        <div className="h-48 animate-pulse rounded bg-dark-600" />
      </Card>
    );
  }

  const taskBreakdown = analytics?.taskBreakdown ?? [];
  const teamBreakdown = analytics?.teamBreakdown ?? [];

  return (
    <Card variant="bordered" className="p-6">
      {/* Header with toggle */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Time Breakdown</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setGroupBy('task')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'task'
                ? 'bg-thyme-600 text-white'
                : 'bg-dark-600 text-gray-400 hover:text-white'
            )}
          >
            By Task
          </button>
          <button
            onClick={() => setGroupBy('team')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              groupBy === 'team'
                ? 'bg-thyme-600 text-white'
                : 'bg-dark-600 text-gray-400 hover:text-white'
            )}
          >
            By Team
          </button>
        </div>
      </div>

      {/* Table */}
      {groupBy === 'task' ? (
        <TaskBreakdownTable
          data={taskBreakdown}
          tasks={tasks}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
        />
      ) : (
        <TeamBreakdownTable
          data={teamBreakdown}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
        />
      )}
    </Card>
  );
}

interface TaskBreakdownItem {
  taskNo: string;
  description: string;
  hours: number;
  teamMembers?: { name: string; hours: number }[];
}

interface TaskFromStore {
  id: string;
  code: string;
  name: string;
}

function TaskBreakdownTable({
  data,
  tasks,
  expanded,
  toggleExpanded,
}: {
  data: TaskBreakdownItem[];
  tasks: TaskFromStore[];
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-500">No time entries for this project</p>
      </div>
    );
  }

  // Create a map of task codes to task info for descriptions
  const taskMap = new Map(tasks.map((t) => [t.code, t]));

  return (
    <div className="overflow-hidden rounded-lg border border-dark-600">
      <table className="w-full">
        <thead className="bg-dark-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Task</th>
            <th className="w-32 px-4 py-3 text-right text-sm font-medium text-gray-400">Hours</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-600">
          {data.map((item) => {
            const taskInfo = taskMap.get(item.taskNo);
            const hasDetails = item.teamMembers && item.teamMembers.length > 0;
            const isExpanded = expanded[item.taskNo];

            return (
              <>
                <tr
                  key={item.taskNo}
                  className={cn(
                    'transition-colors',
                    hasDetails && 'cursor-pointer hover:bg-dark-700/50'
                  )}
                  onClick={() => hasDetails && toggleExpanded(item.taskNo)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {hasDetails && (
                        <span className="text-gray-500">
                          {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </span>
                      )}
                      <div>
                        <span className="font-mono text-xs text-gray-500">{item.taskNo}</span>
                        <span className="ml-2 text-white">
                          {taskInfo?.name || item.description || 'Unknown Task'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {item.hours.toFixed(1)}
                  </td>
                </tr>
                {/* Expanded details */}
                {isExpanded &&
                  item.teamMembers?.map((member) => (
                    <tr key={`${item.taskNo}-${member.name}`} className="bg-dark-800/50">
                      <td className="py-2 pl-12 pr-4">
                        <span className="text-sm text-gray-400">{member.name}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-400">
                        {member.hours.toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-dark-700">
          <tr>
            <td className="px-4 py-3 font-medium text-white">Total</td>
            <td className="px-4 py-3 text-right font-bold text-white">
              {data.reduce((sum, item) => sum + item.hours, 0).toFixed(1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface TeamBreakdownItem {
  resourceNo: string;
  name: string;
  hours: number;
  tasks?: { taskNo: string; description: string; hours: number }[];
}

function TeamBreakdownTable({
  data,
  expanded,
  toggleExpanded,
}: {
  data: TeamBreakdownItem[];
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
}) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-500">No team members have logged time on this project</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-dark-600">
      <table className="w-full">
        <thead className="bg-dark-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Team Member</th>
            <th className="w-32 px-4 py-3 text-right text-sm font-medium text-gray-400">Hours</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dark-600">
          {data.map((item) => {
            const hasDetails = item.tasks && item.tasks.length > 0;
            const isExpanded = expanded[item.resourceNo];

            return (
              <>
                <tr
                  key={item.resourceNo}
                  className={cn(
                    'transition-colors',
                    hasDetails && 'cursor-pointer hover:bg-dark-700/50'
                  )}
                  onClick={() => hasDetails && toggleExpanded(item.resourceNo)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {hasDetails && (
                        <span className="text-gray-500">
                          {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </span>
                      )}
                      <span className="text-white">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {item.hours.toFixed(1)}
                  </td>
                </tr>
                {/* Expanded details */}
                {isExpanded &&
                  item.tasks?.map((task) => (
                    <tr key={`${item.resourceNo}-${task.taskNo}`} className="bg-dark-800/50">
                      <td className="py-2 pl-12 pr-4">
                        <span className="font-mono text-xs text-gray-500">{task.taskNo}</span>
                        <span className="ml-2 text-sm text-gray-400">{task.description}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-400">
                        {task.hours.toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-dark-700">
          <tr>
            <td className="px-4 py-3 font-medium text-white">Total</td>
            <td className="px-4 py-3 text-right font-bold text-white">
              {data.reduce((sum, item) => sum + item.hours, 0).toFixed(1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
