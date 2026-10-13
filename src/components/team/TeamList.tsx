'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { BillableTargetEditor } from '@/components/targets';
import { WeeklyCapacityEditor } from './WeeklyCapacityEditor';
import { TeamTable, DEFAULT_TEAM_TABLE_SORT } from './TeamTable';
import type { TeamTableRow, TeamTableSort } from './TeamTable';
import { GitHubUsernameEditor } from './GitHubUsernameEditor';
import { ProjectsUnavailableWarning } from './ProjectsUnavailableWarning';
import {
  Card,
  WeekNavigation,
  ExtensionPreviewWrapper,
  StageBar,
  StageLegend,
  getStageSegments,
} from '@/components/ui';
import { bcClient, loadTeamHours, ExtensionNotInstalledError } from '@/services/bc';
import { useCompanyStore, useBillableTargetStore, usePlanStore, useResourcePhotos } from '@/hooks';
import { useAuth } from '@/services/auth';
import {
  getWeekStart,
  getBCResourcesListUrl,
  BILLABLE_RULE_DESCRIPTION,
  hasBillableTargetFields,
  resolveBillableTarget,
  resolveCompanyDefault,
  summariseHours,
  isCounted,
  hasWeeklyCapacityFields,
  hasGitHubUsernameField,
  withWeeklyCapacityFields,
  getBillableTargetGap,
  getBillableTargetBand,
  formatTargetGap,
  TARGET_GAP_DESCRIPTION,
  BILLABLE_TARGET_BAND_COLORS,
} from '@/utils';
import type { StageHours, WeeklyCapacity } from '@/utils';
import { cn } from '@/utils';
import type { BCResource } from '@/types';
import { getTimesheetCompletionColor, TIMESHEET_COMPLETION_DESCRIPTION } from '@/config';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface TeamMember {
  id: string;
  number: string; // Resource code/number from BC
  name: string;
  email: string;
  role: string;
  totalHours: number;
  stages: StageHours; // totalHours split by timesheet stage
  billableHours: number;
  nonBillableHours: number;
  /** Their working day and default week, from BC units of measure (see resolveWeeklyCapacity) */
  weeklyBase: Pick<WeeklyCapacity, 'hoursPerDay' | 'defaultHours'>;
  billablePercent: number; // percentage of total hours that are billable
  isCurrentUser: boolean; // Whether this resource belongs to the logged-in user
  // The person's own billable target from BC (undefined on older Thyme BC Extensions)
  billableTargetPercent?: number;
  billableTargetSet?: boolean;
  // The person's own weekly capacity from BC (undefined on older Thyme BC Extensions)
  weeklyCapacityHours?: number;
  weeklyCapacitySet?: boolean;
  flexibleWorkingDays?: boolean;
  // Their GitHub username ('' = not set) and whether the signed-in user may change it
  // (Thyme BC Extension 1.21+; undefined on older versions)
  githubUsername?: string;
  canEditConnectedAccounts?: boolean;
}

/**
 * A member with their weekly capacity and effective billable target (null when targets
 * aren't available). Someone with a weekly capacity of 0 is listed but not counted
 * (`weekly.excluded`): no completion or target, and left out of the team totals.
 */
type TeamMemberRow = TeamMember &
  Pick<TeamTableRow, 'weekly' | 'capacity' | 'completion' | 'target'>;

export function TeamList() {
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  // The members' BC resources, for their profile photos
  const [resources, setResources] = useState<BCResource[]>([]);
  const photos = useResourcePhotos(resources, userEmail);
  // Projects didn't load, so internal time can't be told apart from billable
  const [projectsUnavailable, setProjectsUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserInList, setCurrentUserInList] = useState(true);
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  // Whether the Thyme BC Extension returns billable targets on resources
  const [targetFieldsPresent, setTargetFieldsPresent] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  // Whether the Thyme BC Extension returns weekly capacity on resources (1.19+)
  const [capacityFieldsPresent, setCapacityFieldsPresent] = useState(false);
  const [editingCapacityMemberId, setEditingCapacityMemberId] = useState<string | null>(null);
  // Whether the Thyme BC Extension stores GitHub usernames on resources (1.21+)
  const [githubFieldPresent, setGitHubFieldPresent] = useState(false);
  const [editingGitHubMemberId, setEditingGitHubMemberId] = useState<string | null>(null);

  // Company default billable target, for anyone without their own
  const { companyDefaultPercent, setupAvailable, loadedForCompanyVersion, loadCompanyDefault } =
    useBillableTargetStore();
  const companyDefault = resolveCompanyDefault(companyDefaultPercent);
  useEffect(() => {
    if (targetFieldsPresent) void loadCompanyDefault(companyVersion);
  }, [targetFieldsPresent, companyVersion, loadCompanyDefault]);
  // Show targets only once this company's Thyme Setup has loaded, so another company's
  // default is never used, and not at all on extensions without Thyme Setup
  const targetsEnabled =
    targetFieldsPresent && setupAvailable === true && loadedForCompanyVersion === companyVersion;

  // Week navigation state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  // Kept here so it survives the table unmounting while another week loads
  const [sort, setSort] = useState<TeamTableSort>(DEFAULT_TEAM_TABLE_SORT);

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

  // Fetch resources and their hours when company or week changes
  useEffect(() => {
    // A newer week or company makes this load stale: its results are dropped
    let cancelled = false;
    async function fetchTeamData() {
      setIsLoading(true);
      setError(null);
      setExtensionNotInstalled(false);
      try {
        // Hours, capacity and the people on the team come from loadTeamHours, the same
        // calculation as Reports, so both pages agree for the same week
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const [{ people, projectsUnavailable }, currentUserResource] = await Promise.all([
          loadTeamHours(currentWeekStart, weekEnd),
          userEmail ? bcClient.getResourceByEmail(userEmail) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProjectsUnavailable(projectsUnavailable);
        setTargetFieldsPresent(hasBillableTargetFields(people.map((p) => p.resource)));
        setCapacityFieldsPresent(hasWeeklyCapacityFields(people.map((p) => p.resource)));
        setGitHubFieldPresent(hasGitHubUsernameField(people.map((p) => p.resource)));
        if (userEmail) setCurrentUserInList(currentUserResource !== null);

        // Get the current user's resource ID to mark them in the list
        const currentUserResourceId = currentUserResource?.id;

        const membersWithHours = people.map(
          ({ resource, capacity, weekly, stages, billableHours }): TeamMember => {
            const totalHours = stages.total;
            const nonBillableHours = totalHours - billableHours;
            const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

            return {
              id: resource.id,
              number: resource.number,
              name: resource.name || resource.displayName || resource.number,
              email: '', // Resources don't have email in standard API
              role: resource.number, // Show resource code in role column
              totalHours,
              stages,
              billableHours,
              nonBillableHours,
              weeklyBase: weekly ?? { hoursPerDay: capacity / 5, defaultHours: capacity },
              billablePercent,
              isCurrentUser: resource.id === currentUserResourceId,
              billableTargetPercent: resource.billableTargetPercent,
              billableTargetSet: resource.billableTargetSet,
              weeklyCapacityHours: resource.weeklyCapacityHours,
              weeklyCapacitySet: resource.weeklyCapacitySet,
              flexibleWorkingDays: resource.flexibleWorkingDays,
              githubUsername: resource.githubUsername,
              canEditConnectedAccounts: resource.canEditConnectedAccounts,
            };
          }
        );

        setMembers(membersWithHours);
        setResources(people.map((p) => p.resource));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ExtensionNotInstalledError) {
          setExtensionNotInstalled(true);
        } else {
          setError('Failed to load team members');
          toast.error('Failed to load team members. Please try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchTeamData();
    return () => {
      cancelled = true;
    };
    // companyVersion changes when company switches, ensuring refetch
  }, [companyVersion, currentWeekStart, userEmail]);

  // Everyone's weekly capacity (their own, or hours per day x 5) and effective billable
  // target (their own, or the company default)
  const rows = useMemo<TeamMemberRow[]>(
    () =>
      members.map((m) => {
        const weekly = withWeeklyCapacityFields(m.weeklyBase, m);
        const capacity = weekly.hours;
        return {
          ...m,
          weekly,
          capacity,
          completion: weekly.excluded ? null : capacity > 0 ? (m.totalHours / capacity) * 100 : 0,
          target:
            targetsEnabled && !weekly.excluded ? resolveBillableTarget(m, companyDefault) : null,
        };
      }),
    [members, targetsEnabled, companyDefault]
  );

  // Totals: the same calculation as Reports. Team target: everyone's target weighted
  // by their capacity. People on a weekly capacity of 0 are listed but not counted.
  const totals = useMemo(() => {
    const summary = summariseHours(
      rows.filter(isCounted).map((m) => ({ ...m, targetPercent: m.target?.percent ?? null }))
    );
    return {
      ...summary,
      totalCapacity: summary.capacity,
      billableTarget: targetsEnabled ? summary.billableTarget : null,
    };
  }, [rows, targetsEnabled]);

  const editingMember = rows.find((m) => m.id === editingMemberId) ?? null;
  const editingCapacityMember = rows.find((m) => m.id === editingCapacityMemberId) ?? null;
  const editingGitHubMember = rows.find((m) => m.id === editingGitHubMemberId) ?? null;

  // Another company's people: close the GitHub username editor
  useEffect(() => {
    setEditingGitHubMemberId(null);
  }, [companyVersion]);

  // Apply a GitHub username saved in the editor without reloading the week
  const handleGitHubSaved = (memberId: string, resource: BCResource) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              githubUsername: resource.githubUsername ?? '',
              canEditConnectedAccounts:
                resource.canEditConnectedAccounts ?? m.canEditConnectedAccounts,
            }
          : m
      )
    );
  };

  // Apply a weekly capacity saved in the editor without reloading the week. The Plan caches
  // resources (for its weekly over-allocation flags), so drop that cache to pick it up.
  const handleCapacitySaved = (memberId: string, resource: BCResource) => {
    usePlanStore.getState().clearCache();
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              weeklyCapacityHours: resource.weeklyCapacityHours,
              weeklyCapacitySet: resource.weeklyCapacitySet,
              flexibleWorkingDays: resource.flexibleWorkingDays,
            }
          : m
      )
    );
  };

  // Apply a target saved in the editor without reloading the week
  const handleTargetSaved = (memberId: string, resource: BCResource) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              billableTargetPercent: resource.billableTargetPercent,
              billableTargetSet: resource.billableTargetSet,
            }
          : m
      )
    );
  };

  const totalSegments = getStageSegments(totals.stages);

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

  // Filter by search query; the table sorts
  const displayRows = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = query
      ? rows.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.email.toLowerCase().includes(query) ||
            m.role.toLowerCase().includes(query)
        )
      : rows;
    return filtered.map((m) => ({ ...m, photoUrl: photos[m.id] ?? null }));
  }, [rows, searchQuery, photos]);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-knowall-green hover:text-knowall-green-light underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Team">
      <div className="space-y-6">
        {/* Business Central Links */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">Open in Business Central:</span>
          <a
            href={getBCResourcesListUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-thyme-400 hover:text-thyme-300 flex items-center gap-1"
          >
            Resources
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>

        {/* Week Navigation */}
        <WeekNavigation
          currentWeekStart={currentWeekStart}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToday={handleToday}
          onDateSelect={handleDateSelect}
        />

        {!isLoading && projectsUnavailable && <ProjectsUnavailableWarning />}

        {/* Warning if current user not in resource list */}
        {!isLoading && !currentUserInList && userEmail && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-medium text-amber-400">You don&apos;t have a Resource record</p>
              <p className="text-dark-300 mt-1">
                Your account ({userEmail}) doesn&apos;t have a matching Resource record in Business
                Central. You won&apos;t be able to track time until your administrator creates a
                Resource record for you with timesheet access enabled.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="border-knowall-green h-8 w-8 animate-spin rounded-full border-b-2"></div>
          </div>
        ) : (
          <>
            {/* Summary Row */}
            <div
              className={cn(
                'grid grid-cols-1 gap-4',
                totals.billableTarget !== null ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-4'
              )}
            >
              {/* Total Hours */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm">Total Hours</p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.totalHours.toFixed(1)}
                </p>
                {/* Same stage split as the project page's Time Spent card */}
                <StageBar segments={totalSegments} max={totals.totalHours} className="mt-2" />
                <StageLegend
                  segments={totalSegments}
                  formatHours={(hours) => `${hours.toFixed(1)}h`}
                  className="mt-1.5"
                />
              </Card>

              {/* Team Capacity */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm">Team Capacity</p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.totalCapacity.toFixed(1)}
                </p>
              </Card>

              {/* Timesheet completion: hours logged ÷ capacity, expected 100% */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm" title={TIMESHEET_COMPLETION_DESCRIPTION}>
                  Timesheet completion
                </p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.completion.toFixed(0)}%
                </p>
                <div className="bg-dark-700 mt-2 h-4 w-full overflow-hidden rounded">
                  <div
                    className={cn('h-full rounded', getTimesheetCompletionColor(totals.completion))}
                    style={{ width: `${Math.min(totals.completion, 100)}%` }}
                  />
                </div>
              </Card>

              {/* Billable vs target: team billable % against the capacity-weighted target */}
              {totals.billableTarget !== null && (
                <Card variant="bordered" className="p-4">
                  <p
                    className="text-dark-400 text-sm"
                    title={`Team billable % against everyone's billable target, weighted by capacity. ${BILLABLE_RULE_DESCRIPTION}`}
                  >
                    Billable vs target
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    <span
                      className={cn(
                        'rounded px-1',
                        BILLABLE_TARGET_BAND_COLORS[
                          getBillableTargetBand(
                            totals.billablePercent,
                            totals.billableTarget,
                            totals.totalHours > 0
                          )
                        ]
                      )}
                    >
                      {totals.totalHours > 0 ? `${totals.billablePercent.toFixed(0)}%` : '–'}
                    </span>
                    <span className="text-dark-300 ml-2 text-lg font-medium">
                      / {totals.billableTarget.toFixed(0)}% target
                    </span>
                  </p>
                  <p
                    className="text-dark-400 mt-2 text-xs"
                    title={`${TARGET_GAP_DESCRIPTION} The team target is everyone's target weighted by their capacity.`}
                  >
                    {totals.totalHours > 0
                      ? formatTargetGap(
                          getBillableTargetGap(totals.billablePercent, totals.billableTarget),
                          'the team target'
                        )
                      : 'No hours logged yet'}
                  </p>
                </Card>
              )}

              {/* Pie Chart */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 mb-2 text-sm">Hours Breakdown</p>
                <div className="flex items-center gap-4">
                  <div
                    className="h-20 w-20 shrink-0"
                    role="img"
                    aria-label={`Billable vs non-billable hours. Billable: ${totals.billableHours.toFixed(1)} hours. Non-billable: ${totals.nonBillableHours.toFixed(1)} hours.`}
                  >
                    <Pie data={displayPieData} options={pieOptions} />
                  </div>
                  <div className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-green-500"></span>
                      <div className="text-dark-300">
                        <div>Billable:</div>
                        <div>
                          {totals.billableHours.toFixed(1)}h
                          {totals.totalHours > 0 && (
                            <span className="text-dark-400 ml-1">
                              ({((totals.billableHours / totals.totalHours) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 flex items-start gap-2">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-slate-500"></span>
                      <div className="text-dark-300">
                        <div>Non-billable:</div>
                        <div>
                          {totals.nonBillableHours.toFixed(1)}h
                          {totals.totalHours > 0 && (
                            <span className="text-dark-400 ml-1">
                              ({((totals.nonBillableHours / totals.totalHours) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="text-dark-400 absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-dark-600 bg-dark-800 text-dark-100 placeholder:text-dark-500 focus:border-knowall-green focus:ring-knowall-green w-full rounded-lg border py-2 pr-4 pl-10 focus:ring-1 focus:outline-none"
              />
            </div>

            {/* Team Members Table */}
            <TeamTable
              rows={displayRows}
              targetsEnabled={targetsEnabled}
              showGitHub={githubFieldPresent}
              companyName={selectedCompany?.name}
              emptyMessage={
                searchQuery ? 'No team members match your search' : 'No team members found'
              }
              onEditTarget={(row) => setEditingMemberId(row.id)}
              onEditCapacity={
                capacityFieldsPresent ? (row) => setEditingCapacityMemberId(row.id) : undefined
              }
              onEditGitHub={(row) => setEditingGitHubMemberId(row.id)}
              sort={sort}
              onSortChange={setSort}
            />
          </>
        )}
      </div>

      {editingMember?.target && (
        <BillableTargetEditor
          isOpen
          onClose={() => setEditingMemberId(null)}
          resourceId={editingMember.id}
          personName={editingMember.name}
          current={editingMember.target}
          companyDefaultPercent={companyDefault}
          onSaved={(resource) => handleTargetSaved(editingMember.id, resource)}
        />
      )}

      {editingGitHubMember && (
        <GitHubUsernameEditor
          isOpen
          onClose={() => setEditingGitHubMemberId(null)}
          resourceId={editingGitHubMember.id}
          personName={editingGitHubMember.name}
          current={editingGitHubMember.githubUsername ?? ''}
          isCurrentUser={editingGitHubMember.isCurrentUser}
          onSaved={(resource) => handleGitHubSaved(editingGitHubMember.id, resource)}
        />
      )}

      {editingCapacityMember && (
        <WeeklyCapacityEditor
          isOpen
          onClose={() => setEditingCapacityMemberId(null)}
          resourceId={editingCapacityMember.id}
          personName={editingCapacityMember.name}
          current={editingCapacityMember.weekly}
          onSaved={(resource) => handleCapacitySaved(editingCapacityMember.id, resource)}
        />
      )}
    </ExtensionPreviewWrapper>
  );
}
