'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  StarIcon as StarOutlineIcon,
  ArrowTopRightOnSquareIcon,
  CalendarIcon,
  UserIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, Button } from '@/components/ui';
import { projectService } from '@/services/bc/projectService';
import { bcClient } from '@/services/bc/bcClient';
import { cn, getBCJobUrl } from '@/utils';
import { useCompanyStore, useProjectsStore } from '@/hooks';
import type { ExtendedProject, ExtendedTask, BCTimeEntry } from '@/types';
import { format, parseISO } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

interface ProjectDetailsProps {
  projectId: string;
}

type ChartView = 'time' | 'budget';
type GroupBy = 'task' | 'team';

export function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const router = useRouter();
  const selectedCompany = useCompanyStore((state) => state.selectedCompany);
  const { toggleFavorite } = useProjectsStore();

  const [project, setProject] = useState<ExtendedProject | null>(null);
  const [timeEntries, setTimeEntries] = useState<BCTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
  const [chartView, setChartView] = useState<ChartView>('time');
  const [groupBy, setGroupBy] = useState<GroupBy>('task');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadProject() {
      setIsLoading(true);
      setError(null);

      try {
        // Check if extension is installed
        const isInstalled = await bcClient.isExtensionInstalled();
        setExtensionInstalled(isInstalled);

        // Fetch extended project data
        const projectData = await projectService.getExtendedProject(projectId);

        if (!projectData) {
          setError('Project not found');
          return;
        }

        setProject(projectData);

        // Fetch time entries if extension is available
        if (isInstalled) {
          const entries = await projectService.getProjectTimeEntries(projectData.code);
          setTimeEntries(entries);
        }
      } catch (err) {
        setError('Failed to load project details');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  const handleToggleFavorite = () => {
    if (project) {
      toggleFavorite(project.id);
      setProject({ ...project, isFavorite: !project.isFavorite });
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!project) return null;

    const budgetHours = project.budgetHours ?? 0;
    const usageHours = project.usageHours ?? 0;
    const remainingHours = budgetHours - usageHours;
    const percentUsed = budgetHours > 0 ? (usageHours / budgetHours) * 100 : 0;

    // Calculate billable vs non-billable from time entries
    const billableEntries = timeEntries.filter((e) => e.type === 'Resource');
    const billableHours = billableEntries.reduce((sum, e) => sum + e.quantity, 0);
    const nonBillableHours = usageHours - billableHours;

    return {
      budgetHours,
      usageHours,
      remainingHours,
      percentUsed,
      billableHours,
      nonBillableHours,
      budgetCost: project.budgetCost ?? 0,
      usageCost: project.usageCost ?? 0,
    };
  }, [project, timeEntries]);

  // Group tasks by task or team
  const groupedData = useMemo(() => {
    if (!project?.tasks) return {};

    const tasks = project.tasks as ExtendedTask[];

    if (groupBy === 'task') {
      return tasks.reduce(
        (groups, task) => {
          groups[task.code] = {
            name: task.name,
            code: task.code,
            items: [task],
            budgetHours: task.budgetHours ?? 0,
            usageHours: task.usageHours ?? 0,
          };
          return groups;
        },
        {} as Record<
          string,
          {
            name: string;
            code: string;
            items: ExtendedTask[];
            budgetHours: number;
            usageHours: number;
          }
        >
      );
    } else {
      // Group by team member from time entries
      const teamGroups: Record<
        string,
        {
          name: string;
          code: string;
          items: BCTimeEntry[];
          budgetHours: number;
          usageHours: number;
        }
      > = {};

      timeEntries.forEach((entry) => {
        const teamMember = entry.no || 'Unknown';
        if (!teamGroups[teamMember]) {
          teamGroups[teamMember] = {
            name: entry.description || teamMember,
            code: teamMember,
            items: [],
            budgetHours: 0,
            usageHours: 0,
          };
        }
        teamGroups[teamMember].items.push(entry);
        teamGroups[teamMember].usageHours += entry.quantity;
      });

      return teamGroups;
    }
  }, [project, timeEntries, groupBy]);

  // Chart data
  const chartData = useMemo(() => {
    if (!kpis) return null;

    if (chartView === 'time') {
      return {
        labels: ['Budget', 'Spent', 'Remaining'],
        datasets: [
          {
            data: [kpis.budgetHours, kpis.usageHours, Math.max(0, kpis.remainingHours)],
            backgroundColor: ['#3b82f6', '#22c55e', '#9ca3af'],
            borderWidth: 0,
          },
        ],
      };
    } else {
      return {
        labels: ['Budget', 'Spent'],
        datasets: [
          {
            data: [kpis.budgetCost, kpis.usageCost],
            backgroundColor: ['#3b82f6', '#22c55e'],
            borderWidth: 0,
          },
        ],
      };
    }
  }, [kpis, chartView]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#9ca3af',
        },
      },
    },
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-thyme-600"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card variant="bordered" className="p-8 text-center">
          <p className="text-red-400">{error || 'Project not found'}</p>
        </Card>
      </div>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not set';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Back button and header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/projects')}>
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
              <span className="font-mono text-sm text-dark-400">{project.code}</span>
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium',
                  project.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                )}
              >
                {project.bcStatus || project.status}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">{project.name}</h1>
            <p className="mt-1 text-dark-400">{project.customerName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {project.isFavorite ? (
              <StarSolidIcon className="h-5 w-5 text-amber-400" />
            ) : (
              <StarOutlineIcon className="h-5 w-5" />
            )}
          </Button>
          <a
            href={getBCJobUrl(project.code, selectedCompany?.name)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              <ArrowTopRightOnSquareIcon className="mr-2 h-4 w-4" />
              Open in Business Central
            </Button>
          </a>
        </div>
      </div>

      {/* Project Info Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <UserIcon className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400">Project Manager</p>
              <p className="font-medium text-white">
                {project.projectManager ||
                  (extensionInstalled === false ? 'Extension required' : 'Not assigned')}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/20 p-2">
              <CalendarIcon className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400">Start Date</p>
              <p className="font-medium text-white">
                {project.startDate
                  ? formatDate(project.startDate)
                  : extensionInstalled === false
                    ? 'Extension required'
                    : 'Not set'}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/20 p-2">
              <CalendarIcon className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400">End Date</p>
              <p className="font-medium text-white">
                {project.endDate
                  ? formatDate(project.endDate)
                  : extensionInstalled === false
                    ? 'Extension required'
                    : 'Not set'}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/20 p-2">
              <ClockIcon className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-dark-400">Tasks</p>
              <p className="font-medium text-white">{project.tasks.length} tasks</p>
            </div>
          </div>
        </Card>
      </div>

      {/* KPIs Section */}
      {extensionInstalled && kpis && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card variant="bordered" className="p-4">
            <p className="text-xs text-dark-400">Hours Budgeted</p>
            <p className="mt-1 text-2xl font-bold text-white">{formatHours(kpis.budgetHours)}</p>
          </Card>

          <Card variant="bordered" className="p-4">
            <p className="text-xs text-dark-400">Hours Spent</p>
            <p className="mt-1 text-2xl font-bold text-green-400">{formatHours(kpis.usageHours)}</p>
            <div className="mt-2 text-xs text-dark-400">
              <span className="text-green-400">{formatHours(kpis.billableHours)}</span> billable
              {kpis.nonBillableHours > 0 && (
                <>
                  {' '}
                  / <span className="text-gray-400">{formatHours(kpis.nonBillableHours)}</span>{' '}
                  non-billable
                </>
              )}
            </div>
          </Card>

          <Card variant="bordered" className="p-4">
            <p className="text-xs text-dark-400">Hours Remaining</p>
            <p
              className={cn(
                'mt-1 text-2xl font-bold',
                kpis.remainingHours >= 0 ? 'text-blue-400' : 'text-red-400'
              )}
            >
              {formatHours(Math.abs(kpis.remainingHours))}
              {kpis.remainingHours < 0 && ' over'}
            </p>
          </Card>

          <Card variant="bordered" className="p-4">
            <p className="text-xs text-dark-400">Budget Used</p>
            <p className="mt-1 text-2xl font-bold text-white">{kpis.percentUsed.toFixed(0)}%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-dark-700">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  kpis.percentUsed > 100
                    ? 'bg-red-500'
                    : kpis.percentUsed > 80
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                )}
                style={{ width: `${Math.min(100, kpis.percentUsed)}%` }}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Chart and Table Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart */}
        {extensionInstalled && chartData && (
          <Card variant="bordered" className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Overview</h3>
              <div className="flex rounded-lg bg-dark-700 p-1">
                <button
                  onClick={() => setChartView('time')}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm transition-colors',
                    chartView === 'time'
                      ? 'bg-dark-600 text-white'
                      : 'text-dark-400 hover:text-white'
                  )}
                >
                  <ClockIcon className="mr-1 inline h-4 w-4" />
                  Time
                </button>
                <button
                  onClick={() => setChartView('budget')}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm transition-colors',
                    chartView === 'budget'
                      ? 'bg-dark-600 text-white'
                      : 'text-dark-400 hover:text-white'
                  )}
                >
                  <CurrencyDollarIcon className="mr-1 inline h-4 w-4" />
                  Budget
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <Doughnut data={chartData} options={chartOptions} />
              </div>
              {chartView === 'budget' && kpis && (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-dark-400">Budget</span>
                    <span className="text-white">{formatCurrency(kpis.budgetCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-400">Spent</span>
                    <span className="text-green-400">{formatCurrency(kpis.usageCost)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tasks/Team Table */}
        <Card variant="bordered" className={extensionInstalled ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {groupBy === 'task' ? 'Tasks' : 'Team'}
            </h3>
            {extensionInstalled && timeEntries.length > 0 && (
              <div className="flex rounded-lg bg-dark-700 p-1">
                <button
                  onClick={() => setGroupBy('task')}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm transition-colors',
                    groupBy === 'task' ? 'bg-dark-600 text-white' : 'text-dark-400 hover:text-white'
                  )}
                >
                  Task
                </button>
                <button
                  onClick={() => setGroupBy('team')}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm transition-colors',
                    groupBy === 'team' ? 'bg-dark-600 text-white' : 'text-dark-400 hover:text-white'
                  )}
                >
                  Team
                </button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-dark-700">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wider text-dark-400">
                <div className="col-span-6">{groupBy === 'task' ? 'Task' : 'Team Member'}</div>
                {extensionInstalled && (
                  <>
                    <div className="col-span-2 text-right">Budgeted</div>
                    <div className="col-span-2 text-right">Actual</div>
                    <div className="col-span-2 text-right">Variance</div>
                  </>
                )}
                {!extensionInstalled && <div className="col-span-6 text-right">Status</div>}
              </div>

              {/* Table Rows */}
              {Object.entries(groupedData).map(([key, group]) => {
                const isExpanded = expandedGroups.has(key);
                const variance = (group.budgetHours || 0) - (group.usageHours || 0);

                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleGroup(key)}
                      className="grid w-full grid-cols-12 gap-4 px-6 py-4 text-left transition-colors hover:bg-dark-700/50"
                    >
                      <div className="col-span-6 flex items-center gap-2">
                        {extensionInstalled &&
                          group.items.length > 0 &&
                          (isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-dark-400" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4 text-dark-400" />
                          ))}
                        <div>
                          <p className="font-medium text-white">{group.name}</p>
                          <p className="text-xs text-dark-400">{group.code}</p>
                        </div>
                      </div>
                      {extensionInstalled && (
                        <>
                          <div className="col-span-2 text-right text-dark-300">
                            {group.budgetHours ? formatHours(group.budgetHours) : '-'}
                          </div>
                          <div className="col-span-2 text-right text-green-400">
                            {formatHours(group.usageHours || 0)}
                          </div>
                          <div
                            className={cn(
                              'col-span-2 text-right',
                              variance >= 0 ? 'text-blue-400' : 'text-red-400'
                            )}
                          >
                            {group.budgetHours ? (
                              <>
                                {variance >= 0 ? '+' : ''}
                                {formatHours(variance)}
                              </>
                            ) : (
                              '-'
                            )}
                          </div>
                        </>
                      )}
                      {!extensionInstalled && (
                        <div className="col-span-6 text-right">
                          <span className="rounded bg-green-500/20 px-2 py-1 text-xs text-green-400">
                            Active
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && extensionInstalled && groupBy === 'team' && (
                      <div className="bg-dark-800/50 px-6 py-2">
                        {(group.items as BCTimeEntry[]).slice(0, 10).map((entry, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-4 py-2 text-sm">
                            <div className="col-span-6 pl-6 text-dark-300">
                              {format(parseISO(entry.postingDate), 'MMM d, yyyy')} -{' '}
                              {entry.description}
                            </div>
                            <div className="col-span-2 text-right text-dark-400">-</div>
                            <div className="col-span-2 text-right text-dark-300">
                              {formatHours(entry.quantity)}
                            </div>
                            <div className="col-span-2 text-right text-dark-400">-</div>
                          </div>
                        ))}
                        {(group.items as BCTimeEntry[]).length > 10 && (
                          <p className="py-2 pl-6 text-xs text-dark-400">
                            + {(group.items as BCTimeEntry[]).length - 10} more entries
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {Object.keys(groupedData).length === 0 && (
                <div className="px-6 py-8 text-center text-dark-400">
                  {extensionInstalled === false
                    ? 'Install the Thyme BC Extension to see task details'
                    : 'No tasks found for this project'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Extension Banner */}
      {extensionInstalled === false && (
        <Card variant="bordered" className="border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/20 p-2">
              <CurrencyDollarIcon className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-amber-400">Extended Features Unavailable</p>
              <p className="text-sm text-dark-300">
                Install the{' '}
                <a
                  href="https://github.com/knowall-ai/thyme-bc-extension"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 underline hover:text-amber-300"
                >
                  Thyme BC Extension
                </a>{' '}
                to see project manager, dates, budget tracking, and more.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
