'use client';

import { useState, useEffect, useMemo } from 'react';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn, getBCResourceUrl, getBCJobTaskUrl } from '@/utils';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { useAuth, getUserProfilePhoto } from '@/services/auth';
import { bcClient } from '@/services/bc';
import { useCompanyStore } from '@/hooks/useCompanyStore';

type GroupBy = 'task' | 'team';

interface ExpandedState {
  [key: string]: boolean;
}

// Map of resourceNo -> photoUrl for caching
interface PhotoMap {
  [resourceNo: string]: string | null;
}

export function ProjectTasksTable() {
  const { analytics, tasks, project, isLoadingAnalytics } = useProjectDetailsStore();
  const { account } = useAuth();
  const { selectedCompany } = useCompanyStore();
  const [groupBy, setGroupBy] = useState<GroupBy>('task');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [photoMap, setPhotoMap] = useState<PhotoMap>({});
  const companyName = selectedCompany?.name;
  const projectNumber = project?.code;

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Extract unique resource numbers from both breakdowns
  const resourceNumbers = useMemo(() => {
    const numbers = new Set<string>();
    analytics?.taskBreakdown?.forEach((task) => {
      task.teamMembers?.forEach((member) => {
        numbers.add(member.resourceNo);
      });
    });
    analytics?.teamBreakdown?.forEach((member) => {
      numbers.add(member.resourceNo);
    });
    return Array.from(numbers);
  }, [analytics]);

  // Fetch profile photos for all resources
  useEffect(() => {
    if (resourceNumbers.length === 0) return;

    const emailDomain = account?.username?.split('@')[1];
    if (!emailDomain) return;

    async function fetchPhotos() {
      try {
        // Get resources to map resourceNo to timeSheetOwnerUserId
        const resources = await bcClient.getResources();
        const resourceMap = new Map(resources.map((r) => [r.number, r]));

        const photoPromises = resourceNumbers.map(async (resourceNo) => {
          const resource = resourceMap.get(resourceNo);
          if (!resource?.timeSheetOwnerUserId) {
            return { resourceNo, photoUrl: null };
          }
          const upn = `${resource.timeSheetOwnerUserId.toLowerCase()}@${emailDomain}`;
          const photoUrl = await getUserProfilePhoto(upn);
          return { resourceNo, photoUrl };
        });

        const results = await Promise.all(photoPromises);
        const newPhotoMap: PhotoMap = {};
        results.forEach(({ resourceNo, photoUrl }) => {
          newPhotoMap[resourceNo] = photoUrl;
        });
        setPhotoMap(newPhotoMap);
      } catch {
        // Ignore photo loading errors
      }
    }

    fetchPhotos();
  }, [resourceNumbers, account?.username]);

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
        <h2 className="text-lg font-semibold text-white">Breakdown</h2>
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
          photoMap={photoMap}
          companyName={companyName}
          projectNumber={projectNumber}
        />
      ) : (
        <TeamBreakdownTable
          data={teamBreakdown}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          photoMap={photoMap}
          companyName={companyName}
          projectNumber={projectNumber}
        />
      )}
    </Card>
  );
}

interface TaskBreakdownItem {
  taskNo: string;
  description: string;
  hours: number;
  approvedHours: number;
  pendingHours: number;
  unitPrice?: number;
  teamMembers?: {
    resourceNo: string;
    name: string;
    hours: number;
    approvedHours: number;
    pendingHours: number;
    unitPrice?: number;
  }[];
}

// Helper component for profile avatar
function ProfileAvatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string;
  photoUrl: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (photoUrl) {
    return (
      <img src={photoUrl} alt={name} className={cn('rounded-full object-cover', sizeClasses)} />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-dark-600 font-medium text-dark-200',
        sizeClasses
      )}
    >
      {initials}
    </div>
  );
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
  photoMap,
  companyName,
  projectNumber,
}: {
  data: TaskBreakdownItem[];
  tasks: TaskFromStore[];
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
  photoMap: PhotoMap;
  companyName?: string;
  projectNumber?: string;
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

  // Calculate totals
  const totalHours = data.reduce((sum, item) => sum + item.hours, 0);
  const totalApproved = data.reduce((sum, item) => sum + item.approvedHours, 0);
  const totalPending = data.reduce((sum, item) => sum + item.pendingHours, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-dark-600">
      <table className="w-full">
        <thead className="bg-dark-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Task</th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-gray-400">Hours</th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-green-400">
              Approved
            </th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-amber-400">
              Pending
            </th>
            <th className="w-24 px-3 py-3 text-right text-sm font-medium text-gray-400">
              Unit Price
            </th>
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
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-gray-500">{item.taskNo}</span>
                        <span className="ml-1 text-white">
                          {taskInfo?.name || item.description || 'Unknown Task'}
                        </span>
                        {projectNumber && (
                          <a
                            href={getBCJobTaskUrl(projectNumber, item.taskNo, companyName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-500 hover:text-thyme-400"
                            title="Open task in Business Central"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-white">
                    {item.hours.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-green-400">
                    {item.approvedHours.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-amber-400">
                    {item.pendingHours > 0 ? item.pendingHours.toFixed(1) : '-'}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500">
                    {item.unitPrice ? `£${item.unitPrice.toFixed(2)}` : '-'}
                  </td>
                </tr>
                {/* Expanded details */}
                {isExpanded &&
                  item.teamMembers?.map((member) => (
                    <tr key={`${item.taskNo}-${member.resourceNo}`} className="bg-dark-800/50">
                      <td className="py-2 pl-12 pr-4">
                        <div className="flex items-center gap-2">
                          <ProfileAvatar
                            name={member.name}
                            photoUrl={photoMap[member.resourceNo]}
                            size="sm"
                          />
                          <span className="text-sm text-gray-400">{member.name}</span>
                          <a
                            href={getBCResourceUrl(member.resourceNo, companyName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-500 hover:text-thyme-400"
                            title="Open resource in Business Central"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-400">
                        {member.hours.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-green-400/70">
                        {member.approvedHours.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-amber-400/70">
                        {member.pendingHours > 0 ? member.pendingHours.toFixed(1) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-500">
                        {member.unitPrice ? `£${member.unitPrice.toFixed(2)}` : '-'}
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
            <td className="px-3 py-3 text-right font-bold text-white">{totalHours.toFixed(1)}</td>
            <td className="px-3 py-3 text-right font-bold text-green-400">
              {totalApproved.toFixed(1)}
            </td>
            <td className="px-3 py-3 text-right font-bold text-amber-400">
              {totalPending > 0 ? totalPending.toFixed(1) : '-'}
            </td>
            <td className="px-3 py-3 text-right text-gray-500">-</td>
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
  approvedHours: number;
  pendingHours: number;
  unitPrice?: number;
  tasks?: {
    taskNo: string;
    description: string;
    hours: number;
    approvedHours: number;
    pendingHours: number;
  }[];
}

function TeamBreakdownTable({
  data,
  expanded,
  toggleExpanded,
  photoMap,
  companyName,
  projectNumber,
}: {
  data: TeamBreakdownItem[];
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
  photoMap: PhotoMap;
  companyName?: string;
  projectNumber?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-500">No team members have logged time on this project</p>
      </div>
    );
  }

  // Calculate totals
  const totalHours = data.reduce((sum, item) => sum + item.hours, 0);
  const totalApproved = data.reduce((sum, item) => sum + item.approvedHours, 0);
  const totalPending = data.reduce((sum, item) => sum + item.pendingHours, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-dark-600">
      <table className="w-full">
        <thead className="bg-dark-700">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Team Member</th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-gray-400">Hours</th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-green-400">
              Approved
            </th>
            <th className="w-20 px-3 py-3 text-right text-sm font-medium text-amber-400">
              Pending
            </th>
            <th className="w-24 px-3 py-3 text-right text-sm font-medium text-gray-400">
              Unit Price
            </th>
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
                      <ProfileAvatar
                        name={item.name}
                        photoUrl={photoMap[item.resourceNo]}
                        size="md"
                      />
                      <span className="text-white">{item.name}</span>
                      <a
                        href={getBCResourceUrl(item.resourceNo, companyName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-500 hover:text-thyme-400"
                        title="Open resource in Business Central"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-white">
                    {item.hours.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-green-400">
                    {item.approvedHours.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right text-amber-400">
                    {item.pendingHours > 0 ? item.pendingHours.toFixed(1) : '-'}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500">
                    {item.unitPrice ? `£${item.unitPrice.toFixed(2)}` : '-'}
                  </td>
                </tr>
                {/* Expanded details */}
                {isExpanded &&
                  item.tasks?.map((task) => (
                    <tr key={`${item.resourceNo}-${task.taskNo}`} className="bg-dark-800/50">
                      <td className="py-2 pl-12 pr-4">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-gray-500">{task.taskNo}</span>
                          <span className="ml-1 text-sm text-gray-400">{task.description}</span>
                          {projectNumber && (
                            <a
                              href={getBCJobTaskUrl(projectNumber, task.taskNo, companyName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-500 hover:text-thyme-400"
                              title="Open task in Business Central"
                            >
                              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-400">
                        {task.hours.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-green-400/70">
                        {task.approvedHours.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-amber-400/70">
                        {task.pendingHours > 0 ? task.pendingHours.toFixed(1) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-500">-</td>
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-dark-700">
          <tr>
            <td className="px-4 py-3 font-medium text-white">Total</td>
            <td className="px-3 py-3 text-right font-bold text-white">{totalHours.toFixed(1)}</td>
            <td className="px-3 py-3 text-right font-bold text-green-400">
              {totalApproved.toFixed(1)}
            </td>
            <td className="px-3 py-3 text-right font-bold text-amber-400">
              {totalPending > 0 ? totalPending.toFixed(1) : '-'}
            </td>
            <td className="px-3 py-3 text-right text-gray-500">-</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
