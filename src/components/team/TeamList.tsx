'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import {
  ChevronUpDownIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  UserGroupIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { BillableTargetBadge, BillableTargetEditor } from '@/components/targets';
import { WeeklyCapacityEditor } from './WeeklyCapacityEditor';
import { GitHubUsernameEditor } from './GitHubUsernameEditor';
import {
  Card,
  WeekNavigation,
  ExtensionPreviewWrapper,
  GitHubIcon,
  StageBar,
  StageLegend,
  getStageSegments,
} from '@/components/ui';
import { bcClient, loadTeamHours, ExtensionNotInstalledError } from '@/services/bc';
import { useCompanyStore, useBillableTargetStore, usePlanStore } from '@/hooks';
import { useAuth, resolveResourceIdentity } from '@/services/auth';
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
  getGitHubProfileUrl,
  withWeeklyCapacityFields,
  describeWeeklyCapacity,
  getBillableTargetGap,
  getBillableTargetBand,
  formatTargetGap,
  TARGET_GAP_DESCRIPTION,
  BILLABLE_TARGET_BAND_COLORS,
} from '@/utils';
import type { StageHours, BillableTarget, WeeklyCapacity } from '@/utils';
import { cn } from '@/utils';
import type { BCResource } from '@/types';
import {
  teamConfig,
  getTimesheetCompletionColor,
  getBillableColor,
  TIMESHEET_COMPLETION_DESCRIPTION,
} from '@/config';

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
  photoUrl: string | null; // Azure AD profile photo URL
  userPrincipalName: string | null; // time sheet owner's UPN, used to resolve the member's own photo
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
type TeamMemberRow = TeamMember & {
  weekly: WeeklyCapacity;
  capacity: number;
  /** Timesheet completion: hours logged as a percentage of capacity (null when not counted) */
  completion: number | null;
  target: BillableTarget | null;
};

type SortField =
  | 'name'
  | 'code'
  | 'totalHours'
  | 'completion'
  | 'capacity'
  | 'billablePercent'
  | 'billableGap';
type SortDirection = 'asc' | 'desc';

// Points above (+) or below (-) the member's billable target; 0 without a target.
// Someone with no hours counts as 0% billable, so they sort with the furthest behind.
function getMemberGap(member: TeamMemberRow): number {
  return member.target ? getBillableTargetGap(member.billablePercent, member.target.percent) : 0;
}

// People who aren't counted sort below everyone else by completion
const sortableCompletion = (member: TeamMemberRow) => member.completion ?? -1;

// Build URL to open a resource in BC web client
function getBCResourceUrl(
  tenantId: string,
  environment: string,
  companyName: string,
  resourceNumber: string
): string {
  // BC Web Client URL format: opens the Resource Card (page 76) filtered to this resource
  // Note: BC expects the company display name, not the GUID
  const encodedCompany = encodeURIComponent(companyName);
  // Escape single quotes in resource number for OData filter syntax (double them per OData standard)
  const escapedResourceNumber = resourceNumber.replace(/'/g, "''");
  const filter = encodeURIComponent(`No. IS '${escapedResourceNumber}'`);
  return `https://businesscentral.dynamics.com/${tenantId}/${environment}/?company=${encodedCompany}&page=76&filter=Resource.${filter}`;
}

export function TeamList() {
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
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

  // Fetch resources and their hours when company or week changes
  useEffect(() => {
    async function fetchTeamData() {
      setIsLoading(true);
      setError(null);
      setExtensionNotInstalled(false);
      try {
        // Hours, capacity and the people on the team come from loadTeamHours, the same
        // calculation as Reports, so both pages agree for the same week
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const [{ people }, currentUserResource] = await Promise.all([
          loadTeamHours(currentWeekStart, weekEnd),
          userEmail ? bcClient.getResourceByEmail(userEmail) : Promise.resolve(null),
        ]);
        setTargetFieldsPresent(hasBillableTargetFields(people.map((p) => p.resource)));
        setCapacityFieldsPresent(hasWeeklyCapacityFields(people.map((p) => p.resource)));
        setGitHubFieldPresent(hasGitHubUsernameField(people.map((p) => p.resource)));
        if (userEmail) setCurrentUserInList(currentUserResource !== null);

        // Get the current user's resource ID to mark them in the list
        const currentUserResourceId = currentUserResource?.id;

        // Extract domain from current user's email for deriving UPNs
        const emailDomain = userEmail ? userEmail.split('@')[1] : null;

        const membersWithHours = people.map(
          ({ resource, capacity, weekly, stages, billableHours }): TeamMember => {
            const totalHours = stages.total;
            const nonBillableHours = totalHours - billableHours;
            const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;

            // Derive UPN from BC timeSheetOwnerUserId (e.g., "BEN.WEEKS" -> "ben.weeks@domain.com")
            let userPrincipalName: string | null = null;
            if (resource.timeSheetOwnerUserId && emailDomain) {
              userPrincipalName = `${resource.timeSheetOwnerUserId.toLowerCase()}@${emailDomain}`;
            }

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
              photoUrl: null, // Will be fetched separately
              userPrincipalName,
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

        // Fetch each member's own profile photo (don't block initial render)
        void (async () => {
          try {
            const photoUpdates = await Promise.all(
              membersWithHours.map(async (member) => {
                const { photoUrl } = await resolveResourceIdentity(
                  { name: member.name, ownerUserId: member.userPrincipalName },
                  emailDomain ?? ''
                );
                if (!photoUrl) {
                  return null;
                }
                return { id: member.id, photoUrl };
              })
            );

            const validUpdates = photoUpdates.filter(
              (update): update is { id: string; photoUrl: string } => update !== null
            );

            if (validUpdates.length > 0) {
              setMembers((prev) =>
                prev.map((member) => {
                  const update = validUpdates.find((u) => u.id === member.id);
                  return update ? { ...member, photoUrl: update.photoUrl } : member;
                })
              );
            }
          } catch {
            // Ignore photo loading errors to avoid impacting main data load
          }
        })();
      } catch (err) {
        if (err instanceof ExtensionNotInstalledError) {
          setExtensionNotInstalled(true);
        } else {
          setError('Failed to load team members');
          toast.error('Failed to load team members. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchTeamData();
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

  // Sorting and filtering
  const filteredAndSortedMembers = useMemo(() => {
    let result = [...rows];

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
        case 'code':
          comparison = a.number.localeCompare(b.number);
          break;
        case 'totalHours':
          comparison = a.totalHours - b.totalHours;
          break;
        case 'completion':
          comparison = sortableCompletion(a) - sortableCompletion(b);
          break;
        case 'capacity':
          comparison = a.capacity - b.capacity;
          break;
        case 'billablePercent':
          comparison = a.billablePercent - b.billablePercent;
          break;
        case 'billableGap':
          comparison = getMemberGap(a) - getMemberGap(b);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [rows, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    // Show up/down arrow on all sortable columns
    // Full opacity when sorted, reduced opacity when not sorted
    return <ChevronUpDownIcon className={cn('h-4 w-4', sortField !== field && 'opacity-50')} />;
  };

  // Get aria-sort value for accessible sortable headers
  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  // Get timesheet completion status text for accessibility
  const getCompletionStatus = (completion: number): string => {
    if (completion >= teamConfig.timesheetCompletion.thresholds.high) {
      return 'complete';
    } else if (completion >= teamConfig.timesheetCompletion.thresholds.low) {
      return 'partly complete';
    }
    return 'incomplete - needs attention';
  };

  // Stage breakdown for a member's Hours cell (tooltip and screen readers)
  const getStageSummary = (stages: StageHours): string =>
    getStageSegments(stages)
      .map((seg) => `${seg.label} ${seg.hours.toFixed(1)}h`)
      .join(' · ');

  // Get billable status text for accessibility
  const getBillableStatus = (billablePercent: number): string => {
    if (billablePercent >= teamConfig.billable.thresholds.high) {
      return 'high';
    } else if (billablePercent >= teamConfig.billable.thresholds.low) {
      return 'moderate';
    }
    return 'low';
  };

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
            <Card variant="bordered" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-dark-700 bg-dark-800/50 border-b">
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-left text-sm font-medium"
                        onClick={() => handleSort('name')}
                        role="columnheader"
                        aria-sort={getAriaSort('name')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Employee
                          <SortIcon field="name" />
                        </div>
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-left text-sm font-medium"
                        onClick={() => handleSort('code')}
                        role="columnheader"
                        aria-sort={getAriaSort('code')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('code')}
                      >
                        <div className="flex items-center gap-1">
                          Code
                          <SortIcon field="code" />
                        </div>
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                        onClick={() => handleSort('totalHours')}
                        role="columnheader"
                        aria-sort={getAriaSort('totalHours')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('totalHours')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Hours
                          <SortIcon field="totalHours" />
                        </div>
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                        onClick={() => handleSort('completion')}
                        role="columnheader"
                        aria-sort={getAriaSort('completion')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('completion')}
                        title={TIMESHEET_COMPLETION_DESCRIPTION}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Timesheet completion
                          <SortIcon field="completion" />
                        </div>
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                        onClick={() => handleSort('capacity')}
                        role="columnheader"
                        aria-sort={getAriaSort('capacity')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('capacity')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Capacity
                          <SortIcon field="capacity" />
                        </div>
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                        onClick={() => handleSort('billablePercent')}
                        role="columnheader"
                        aria-sort={getAriaSort('billablePercent')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('billablePercent')}
                        title={BILLABLE_RULE_DESCRIPTION}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {targetsEnabled ? 'Billable % / target' : 'Billable %'}
                          <SortIcon field="billablePercent" />
                        </div>
                      </th>
                      {targetsEnabled && (
                        <th
                          className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                          onClick={() => handleSort('billableGap')}
                          role="columnheader"
                          aria-sort={getAriaSort('billableGap')}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleSort('billableGap')}
                          title={TARGET_GAP_DESCRIPTION}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Gap to target
                            <SortIcon field="billableGap" />
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedMembers.map((member) => (
                      <tr
                        key={member.id}
                        className={cn(
                          'border-dark-700 hover:bg-dark-800/50 border-b last:border-b-0',
                          member.weekly.excluded && 'opacity-50'
                        )}
                        title={
                          member.weekly.excluded
                            ? 'Not counted: weekly capacity is 0, so this person is left out of the team totals'
                            : undefined
                        }
                        data-testid={member.weekly.excluded ? 'team-member-not-counted' : undefined}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {member.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.name}
                                className="h-9 w-9 rounded-full object-cover"
                              />
                            ) : (
                              <div className="bg-dark-600 text-dark-200 flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium">
                                {member.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-dark-100 font-medium">
                                {member.name}
                                {member.isCurrentUser && (
                                  <span className="text-knowall-green ml-2">(you)</span>
                                )}
                              </p>
                              {member.email && (
                                <p className="text-dark-400 text-xs">{member.email}</p>
                              )}
                              {githubFieldPresent && (
                                <MemberGitHub
                                  member={member}
                                  onEdit={() => setEditingGitHubMemberId(member.id)}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-dark-300">{member.role}</span>
                            {selectedCompany?.name && (
                              <a
                                href={getBCResourceUrl(
                                  bcClient.tenantId,
                                  bcClient.environment,
                                  selectedCompany.name,
                                  member.number
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-dark-400 hover:text-knowall-green"
                                title="Open in Business Central"
                              >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex flex-col items-end gap-1"
                            title={
                              member.totalHours > 0 ? getStageSummary(member.stages) : undefined
                            }
                          >
                            <span className="text-dark-100">{member.totalHours.toFixed(1)}</span>
                            {/* The member's hours by stage; full width = their total */}
                            {member.totalHours > 0 && (
                              <>
                                <StageBar
                                  segments={getStageSegments(member.stages)}
                                  max={member.totalHours}
                                  className="h-1 w-16"
                                />
                                <span className="sr-only">{getStageSummary(member.stages)}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {member.completion === null ? (
                            <div className="text-dark-400 text-right text-sm" title="Not counted">
                              –
                            </div>
                          ) : (
                            <div
                              className="flex flex-col items-end gap-1"
                              role="meter"
                              aria-valuenow={member.completion}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`Timesheet completion ${member.completion.toFixed(0)}% - ${getCompletionStatus(member.completion)}`}
                              title={`${member.totalHours.toFixed(1)}h logged of ${member.capacity.toFixed(1)}h capacity`}
                            >
                              <span className="text-dark-100 text-sm font-medium">
                                {member.completion.toFixed(0)}%
                              </span>
                              <div className="bg-dark-700 h-4 w-24 overflow-hidden rounded">
                                <div
                                  className={cn(
                                    'h-full',
                                    getTimesheetCompletionColor(member.completion)
                                  )}
                                  style={{ width: `${Math.min(member.completion, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="text-dark-300 px-4 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            title={describeWeeklyCapacity(member.weekly)}
                          >
                            {member.weekly.flexible && (
                              <span className="bg-dark-700 text-dark-300 rounded px-1.5 py-0.5 text-xs">
                                flexible
                              </span>
                            )}
                            <span className="tabular-nums">{member.capacity.toFixed(1)}</span>
                            {capacityFieldsPresent && (
                              <button
                                type="button"
                                onClick={() => setEditingCapacityMemberId(member.id)}
                                className="text-dark-400 hover:text-knowall-green rounded p-1"
                                title="Edit weekly capacity"
                                aria-label={`Edit weekly capacity for ${member.name}`}
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {member.weekly.excluded ? (
                            <span className="text-dark-400 text-sm">
                              {member.totalHours > 0
                                ? `${member.billablePercent.toFixed(0)}%`
                                : '–'}
                            </span>
                          ) : member.target ? (
                            <div className="flex items-center justify-end gap-1">
                              <BillableTargetBadge
                                actualPercent={member.billablePercent}
                                target={member.target}
                                hasHours={member.totalHours > 0}
                              />
                              <button
                                type="button"
                                onClick={() => setEditingMemberId(member.id)}
                                className="text-dark-400 hover:text-knowall-green rounded p-1"
                                title="Edit billable target"
                                aria-label={`Edit billable target for ${member.name}`}
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                getBillableColor(member.billablePercent)
                              )}
                              aria-label={`Billable percentage ${member.billablePercent.toFixed(0)}% - ${getBillableStatus(member.billablePercent)}`}
                            >
                              {member.billablePercent.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        {targetsEnabled && (
                          <td
                            className="text-dark-300 px-4 py-3 text-right text-sm tabular-nums"
                            title={TARGET_GAP_DESCRIPTION}
                          >
                            {member.target && member.totalHours > 0
                              ? formatTargetGap(getMemberGap(member))
                              : '–'}
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredAndSortedMembers.length === 0 && (
                      <tr>
                        <td colSpan={targetsEnabled ? 7 : 6} className="px-4 py-12 text-center">
                          <UserGroupIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
                          <p className="text-dark-400">
                            {searchQuery
                              ? 'No team members match your search'
                              : 'No team members found'}
                          </p>
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

/**
 * A member's GitHub username under their name, linking to their profile, with a pencil when
 * the signed-in user may change it (an administrator, or it's their own). Nothing for
 * someone without one unless it can be set here.
 */
function MemberGitHub({
  member,
  onEdit,
}: {
  member: Pick<TeamMember, 'name' | 'githubUsername' | 'canEditConnectedAccounts'>;
  onEdit: () => void;
}) {
  const username = member.githubUsername ?? '';
  const profileUrl = getGitHubProfileUrl(username);
  if (!profileUrl && !member.canEditConnectedAccounts) return null;
  return (
    <div className="mt-0.5 flex items-center gap-1 text-xs">
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-dark-400 hover:text-knowall-green inline-flex items-center gap-1"
          title={`${member.name} on GitHub`}
        >
          <GitHubIcon className="h-3.5 w-3.5" />
          {username}
        </a>
      ) : (
        <span className="text-dark-500 inline-flex items-center gap-1">
          <GitHubIcon className="h-3.5 w-3.5" />
          No GitHub username
        </span>
      )}
      {member.canEditConnectedAccounts && (
        <button
          type="button"
          onClick={onEdit}
          className="text-dark-400 hover:text-knowall-green rounded p-0.5"
          title={profileUrl ? 'Change GitHub username' : 'Add GitHub username'}
          aria-label={`${profileUrl ? 'Change' : 'Add'} GitHub username for ${member.name}`}
        >
          <PencilSquareIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
