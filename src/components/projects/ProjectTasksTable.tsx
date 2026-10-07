'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { useProjectDetailsStore } from '@/hooks/useProjectDetailsStore';
import { Card } from '@/components/ui';
import { cn, getBCResourceUrl, getBCJobTaskUrl } from '@/utils';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
  UserGroupIcon,
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useAuth, resolveResourceIdentity } from '@/services/auth';
import { bcClient } from '@/services/bc';
import { useCompanyStore } from '@/hooks/useCompanyStore';

type GroupBy = 'task' | 'team';

type StatusKey = 'hours' | 'postedHours' | 'approvedHours' | 'submittedHours' | 'unsubmittedHours';
type StatusRow = Record<StatusKey, number>;

// Hour columns, in stage order then the total (same colours as the Time Spent card and weekly chart)
const STATUS_COLUMNS: { key: StatusKey; label: string; text: string; subText: string }[] = [
  { key: 'postedHours', label: 'Posted', text: 'text-thyme-600', subText: 'text-thyme-600/70' },
  { key: 'approvedHours', label: 'Approved', text: 'text-green-400', subText: 'text-green-400/70' },
  {
    key: 'submittedHours',
    label: 'Submitted',
    text: 'text-amber-400',
    subText: 'text-amber-400/70',
  },
  {
    key: 'unsubmittedHours',
    label: 'Unsubmitted',
    text: 'text-amber-400/60',
    subText: 'text-amber-400/40',
  },
  // The stages add up to this, so it comes last
  { key: 'hours', label: 'Total Hours', text: 'text-white', subText: 'text-gray-400' },
];

// null = BC's own order (Job Task No. / Resource No.); otherwise a column, highest or lowest first
type SortState = { key: StatusKey; dir: 'desc' | 'asc' } | null;

const formatHours = (value: number, key: StatusKey) =>
  key === 'hours' || value > 0 ? value.toFixed(1) : '-';

function sortRows<T extends StatusRow>(
  rows: T[],
  sort: SortState,
  bcOrder: (a: T, b: T) => number
) {
  const sorted = [...rows];
  if (!sort) return sorted.sort(bcOrder);
  const sign = sort.dir === 'desc' ? -1 : 1;
  return sorted.sort((a, b) => sign * (a[sort.key] - b[sort.key]) || bcOrder(a, b));
}

function SortableHeaders({
  firstLabel,
  sort,
  onSort,
}: {
  firstLabel: string;
  sort: SortState;
  onSort: (sort: SortState) => void;
}) {
  // Click a column: highest first, then lowest first, then back to BC's order
  const next = (key: StatusKey): SortState =>
    sort?.key !== key ? { key, dir: 'desc' } : sort.dir === 'desc' ? { key, dir: 'asc' } : null;
  const ariaSort = (key: StatusKey) =>
    sort?.key === key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none';
  return (
    <tr>
      <th
        className="px-4 py-3 text-left text-sm font-medium text-gray-400"
        aria-sort={sort ? 'none' : 'ascending'}
      >
        <button
          type="button"
          onClick={() => onSort(null)}
          className="focus-visible:ring-thyme-500 rounded hover:text-white focus:outline-none focus-visible:ring-1"
          title="Business Central order"
        >
          {firstLabel}
        </button>
      </th>
      {STATUS_COLUMNS.map((col) => (
        <th
          key={col.key}
          className={cn(
            'w-24 px-3 py-3 text-right text-sm font-medium whitespace-nowrap',
            col.text
          )}
          aria-sort={ariaSort(col.key)}
        >
          <button
            type="button"
            onClick={() => onSort(next(col.key))}
            className="focus-visible:ring-thyme-500 inline-flex items-center gap-0.5 rounded hover:brightness-125 focus:outline-none focus-visible:ring-1"
            title={`Sort by ${col.label.toLowerCase()}`}
          >
            {sort?.key === col.key &&
              (sort.dir === 'desc' ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronUpIcon className="h-3 w-3" />
              ))}
            {col.label}
          </button>
        </th>
      ))}
    </tr>
  );
}

function StatusCells({ row, variant }: { row: StatusRow; variant: 'row' | 'sub' | 'total' }) {
  return (
    <>
      {STATUS_COLUMNS.map((col) => (
        <td
          key={col.key}
          className={cn(
            'px-3 text-right',
            variant === 'sub' ? cn('py-2 text-sm', col.subText) : cn('py-3', col.text),
            variant === 'total' && 'font-bold',
            variant === 'row' && col.key === 'hours' && 'font-medium'
          )}
        >
          {formatHours(row[col.key], col.key)}
        </td>
      ))}
    </>
  );
}

const sumStatus = (rows: StatusRow[]): StatusRow =>
  STATUS_COLUMNS.reduce(
    (acc, col) => ({ ...acc, [col.key]: rows.reduce((sum, r) => sum + r[col.key], 0) }),
    {} as StatusRow
  );

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
  const [isPrinting, setIsPrinting] = useState(false);
  const [sort, setSort] = useState<SortState>(null);

  // Detect print mode to expand all tasks
  // flushSync ensures React commits to DOM synchronously so the browser
  // captures the expanded state before rendering the print preview
  useEffect(() => {
    const handleBeforePrint = () => flushSync(() => setIsPrinting(true));
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);
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
        // Get resources to map resourceNo to the resource's name and owner
        const resources = await bcClient.getResources();
        const resourceMap = new Map(resources.map((r) => [r.number, r]));

        const photoPromises = resourceNumbers.map(async (resourceNo) => {
          const resource = resourceMap.get(resourceNo);
          if (!resource) {
            return { resourceNo, photoUrl: null };
          }
          // The photo is the resource's own, not the (possibly shared) time sheet owner's
          const { photoUrl } = await resolveResourceIdentity(
            {
              name: resource.name || resource.displayName,
              ownerUserId: resource.timeSheetOwnerUserId,
            },
            emailDomain ?? ''
          );
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

  const taskBreakdown = useMemo(() => analytics?.taskBreakdown ?? [], [analytics?.taskBreakdown]);
  const teamBreakdown = useMemo(() => analytics?.teamBreakdown ?? [], [analytics?.teamBreakdown]);

  // Get all expandable keys for the current view
  const expandableKeys = useMemo(() => {
    if (groupBy === 'task') {
      return taskBreakdown
        .filter((item) => item.teamMembers && item.teamMembers.length > 0)
        .map((item) => item.taskNo);
    } else {
      return teamBreakdown
        .filter((item) => item.tasks && item.tasks.length > 0)
        .map((item) => item.resourceNo);
    }
  }, [groupBy, taskBreakdown, teamBreakdown]);

  // Check if all items are expanded
  const allExpanded = expandableKeys.length > 0 && expandableKeys.every((key) => expanded[key]);

  // Toggle expand all
  const toggleExpandAll = () => {
    if (allExpanded) {
      // Collapse all
      setExpanded({});
    } else {
      // Expand all for current view
      const newExpanded: ExpandedState = {};
      expandableKeys.forEach((key) => {
        newExpanded[key] = true;
      });
      setExpanded(newExpanded);
    }
  };

  if (isLoadingAnalytics) {
    return (
      <Card variant="bordered" className="p-6">
        <div className="bg-dark-600 h-48 animate-pulse rounded" />
      </Card>
    );
  }

  return (
    <Card variant="bordered" className="p-6">
      {/* Header with toggle */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Breakdown</h2>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={() => {
              setGroupBy('task');
              setSort(null);
            }}
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
            onClick={() => {
              setGroupBy('team');
              setSort(null);
            }}
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

      {/* Table - print whichever view the user has selected */}
      {groupBy === 'task' ? (
        <TaskBreakdownTable
          data={taskBreakdown}
          tasks={tasks}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          photoMap={photoMap}
          companyName={companyName}
          projectNumber={projectNumber}
          printExpandAll={isPrinting}
          sort={sort}
          onSort={setSort}
        />
      ) : (
        <TeamBreakdownTable
          data={teamBreakdown}
          tasks={tasks}
          sort={sort}
          onSort={setSort}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          photoMap={photoMap}
          companyName={companyName}
          projectNumber={projectNumber}
          printExpandAll={isPrinting}
        />
      )}

      {/* Expand All button */}
      {expandableKeys.length > 0 && (
        <div className="mt-4 flex justify-center print:hidden">
          <button
            onClick={toggleExpandAll}
            className="bg-dark-700 hover:bg-dark-600 flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            {allExpanded ? (
              <>
                <ChevronDoubleUpIcon className="h-4 w-4" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDoubleDownIcon className="h-4 w-4" />
                Expand All
              </>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}

interface TaskBreakdownItem extends StatusRow {
  taskNo: string;
  description: string;
  teamMembers?: (StatusRow & {
    resourceNo: string;
    name: string;
  })[];
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
        'bg-dark-600 text-dark-200 flex items-center justify-center rounded-full font-medium',
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

// BC's order: the project's task list as BC returns it (by Job Task No.), then any task
// codes not in that list, with time on no task ('no-task') last
function compareTaskNo(a: string, b: string, tasks: TaskFromStore[]): number {
  const rank = (code: string) => {
    if (code === 'no-task') return Number.MAX_SAFE_INTEGER;
    const i = tasks.findIndex((t) => t.code === code);
    return i >= 0 ? i : tasks.length;
  };
  return rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true });
}

function TaskBreakdownTable({
  data,
  tasks,
  expanded,
  toggleExpanded,
  photoMap,
  companyName,
  projectNumber,
  printExpandAll = false,
  sort,
  onSort,
}: {
  data: TaskBreakdownItem[];
  tasks: TaskFromStore[];
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
  photoMap: PhotoMap;
  companyName?: string;
  projectNumber?: string;
  printExpandAll?: boolean;
  sort: SortState;
  onSort: (sort: SortState) => void;
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
  const rows = sortRows(data, sort, (a, b) => compareTaskNo(a.taskNo, b.taskNo, tasks));
  const totals = sumStatus(data);

  return (
    <div className="border-dark-600 overflow-hidden rounded-lg border">
      <table className="w-full">
        <thead className="bg-dark-700">
          <SortableHeaders firstLabel="Task" sort={sort} onSort={onSort} />
        </thead>
        <tbody className="divide-dark-600 divide-y">
          {rows.map((item) => {
            const taskInfo = taskMap.get(item.taskNo);
            const hasDetails = item.teamMembers && item.teamMembers.length > 0;
            const isExpanded = printExpandAll || expanded[item.taskNo];

            return (
              <Fragment key={item.taskNo}>
                <tr
                  className={cn(
                    'transition-colors',
                    hasDetails && 'hover:bg-dark-700/50 cursor-pointer'
                  )}
                  onClick={() => hasDetails && toggleExpanded(item.taskNo)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {hasDetails && (
                        <span className="text-gray-500 print:hidden">
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
                            className="hover:text-thyme-400 text-gray-500 print:hidden"
                            title="Open task in Business Central"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <StatusCells row={item} variant="row" />
                </tr>
                {/* Expanded details - always render but hide/show with CSS for print support */}
                {item.teamMembers?.map((member) => (
                  <tr
                    key={`${item.taskNo}-${member.resourceNo}`}
                    className={cn('bg-dark-800/50 print:table-row', !isExpanded && 'hidden')}
                  >
                    <td className="py-2 pr-4 pl-12">
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
                          className="hover:text-thyme-400 text-gray-500 print:hidden"
                          title="Open resource in Business Central"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                    <StatusCells row={member} variant="sub" />
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-dark-700">
          <tr>
            <td className="px-4 py-3 font-medium text-white">Total</td>
            <StatusCells row={totals} variant="total" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface TeamBreakdownItem extends StatusRow {
  resourceNo: string;
  name: string;
  tasks?: (StatusRow & {
    taskNo: string;
    description: string;
  })[];
}

function TeamBreakdownTable({
  data,
  tasks,
  sort,
  onSort,
  expanded,
  toggleExpanded,
  photoMap,
  companyName,
  projectNumber,
  printExpandAll = false,
}: {
  data: TeamBreakdownItem[];
  tasks: TaskFromStore[];
  sort: SortState;
  onSort: (sort: SortState) => void;
  expanded: ExpandedState;
  toggleExpanded: (key: string) => void;
  photoMap: PhotoMap;
  companyName?: string;
  projectNumber?: string;
  printExpandAll?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="py-12 text-center">
        <UserGroupIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
        <p className="text-dark-400">No team members have logged time on this project</p>
      </div>
    );
  }

  const taskMap = new Map(tasks.map((t) => [t.code, t]));
  // BC lists resources by No.
  const rows = sortRows(data, sort, (a, b) =>
    a.resourceNo.localeCompare(b.resourceNo, undefined, { numeric: true })
  );
  const totals = sumStatus(data);

  return (
    <div className="border-dark-600 overflow-hidden rounded-lg border">
      <table className="w-full">
        <thead className="bg-dark-700">
          <SortableHeaders firstLabel="Team Member" sort={sort} onSort={onSort} />
        </thead>
        <tbody className="divide-dark-600 divide-y">
          {rows.map((item) => {
            const hasDetails = item.tasks && item.tasks.length > 0;
            const isExpanded = printExpandAll || expanded[item.resourceNo];

            return (
              <Fragment key={item.resourceNo}>
                <tr
                  className={cn(
                    'transition-colors',
                    hasDetails && 'hover:bg-dark-700/50 cursor-pointer'
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
                        className="hover:text-thyme-400 text-gray-500 print:hidden"
                        title="Open resource in Business Central"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                  <StatusCells row={item} variant="row" />
                </tr>
                {/* Expanded details, in BC's task order */}
                {isExpanded &&
                  [...(item.tasks ?? [])]
                    .sort((a, b) => compareTaskNo(a.taskNo, b.taskNo, tasks))
                    .map((task) => (
                      <tr key={`${item.resourceNo}-${task.taskNo}`} className="bg-dark-800/50">
                        <td className="py-2 pr-4 pl-12">
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs text-gray-500">{task.taskNo}</span>
                            <span className="ml-1 text-sm text-gray-400">
                              {taskMap.get(task.taskNo)?.name || task.description}
                            </span>
                            {projectNumber && (
                              <a
                                href={getBCJobTaskUrl(projectNumber, task.taskNo, companyName)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-thyme-400 text-gray-500 print:hidden"
                                title="Open task in Business Central"
                              >
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                        <StatusCells row={task} variant="sub" />
                      </tr>
                    ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-dark-700">
          <tr>
            <td className="px-4 py-3 font-medium text-white">Total</td>
            <StatusCells row={totals} variant="total" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
