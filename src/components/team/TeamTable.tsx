'use client';

import { useMemo, useState } from 'react';
import {
  ChevronUpDownIcon,
  ArrowTopRightOnSquareIcon,
  UserGroupIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { BillableTargetBadge } from '@/components/targets';
import { Card, GitHubIcon, StageBar, getStageSegments, getStageSummary } from '@/components/ui';
import { bcClient } from '@/services/bc';
import {
  cn,
  BILLABLE_RULE_DESCRIPTION,
  getGitHubProfileUrl,
  describeWeeklyCapacity,
  describeFlexibleDays,
  getBillableTargetGap,
  formatTargetGap,
  TARGET_GAP_DESCRIPTION,
} from '@/utils';
import type { StageHours, BillableTarget, WeeklyCapacity } from '@/utils';
import {
  teamConfig,
  getTimesheetCompletionColor,
  getBillableColor,
  TIMESHEET_COMPLETION_DESCRIPTION,
} from '@/config';

/**
 * A person in the team table, with their hours, capacity and effective billable target
 * (null when targets aren't available) for the period shown. Someone with a weekly
 * capacity of 0 is listed but not counted (`weekly.excluded`): no completion or target.
 */
export interface TeamTableRow {
  id: string;
  /** Resource code/number from BC */
  number: string;
  name: string;
  email: string;
  totalHours: number;
  /** totalHours split by timesheet stage */
  stages: StageHours;
  /** Percentage of total hours that are billable */
  billablePercent: number;
  /** Whether this resource belongs to the signed-in user */
  isCurrentUser: boolean;
  photoUrl: string | null;
  /** Their GitHub username ('' = not set); undefined on Thyme BC Extensions before 1.21 */
  githubUsername?: string;
  /** Whether the signed-in user may change their GitHub username */
  canEditConnectedAccounts?: boolean;
  weekly: WeeklyCapacity;
  /** Capacity in hours for the period shown */
  capacity: number;
  /** Timesheet completion: hours logged as a percentage of capacity (null when not counted) */
  completion: number | null;
  target: BillableTarget | null;
}

export type TeamTableSortField =
  | 'name'
  | 'code'
  | 'totalHours'
  | 'completion'
  | 'capacity'
  | 'billablePercent'
  | 'billableGap';

export interface TeamTableSort {
  field: TeamTableSortField;
  direction: 'asc' | 'desc';
}

type SortField = TeamTableSortField;

export const DEFAULT_TEAM_TABLE_SORT: TeamTableSort = { field: 'name', direction: 'asc' };

// Points above (+) or below (-) the member's billable target; 0 without a target.
// Someone with no hours counts as 0% billable, so they sort with the furthest behind.
function getMemberGap(member: TeamTableRow): number {
  return member.target ? getBillableTargetGap(member.billablePercent, member.target.percent) : 0;
}

// People who aren't counted sort below everyone else by completion
const sortableCompletion = (member: TeamTableRow) => member.completion ?? -1;

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

// Get timesheet completion status text for accessibility
const getCompletionStatus = (completion: number): string => {
  if (completion >= teamConfig.timesheetCompletion.thresholds.high) {
    return 'complete';
  } else if (completion >= teamConfig.timesheetCompletion.thresholds.low) {
    return 'partly complete';
  }
  return 'incomplete - needs attention';
};

// Get billable status text for accessibility
const getBillableStatus = (billablePercent: number): string => {
  if (billablePercent >= teamConfig.billable.thresholds.high) {
    return 'high';
  } else if (billablePercent >= teamConfig.billable.thresholds.low) {
    return 'moderate';
  }
  return 'low';
};

export interface TeamTableProps {
  rows: TeamTableRow[];
  /** Show billable % against each person's target, and the gap column */
  targetsEnabled: boolean;
  /**
   * Show the timesheet completion and capacity columns (default true). Off when the
   * hours are only part of each person's time (e.g. one client's), as comparing them
   * with all their capacity would mislead
   */
  showCapacity?: boolean;
  /** Show GitHub usernames under names (Thyme BC Extension 1.21+) */
  showGitHub?: boolean;
  /** The company's name, for links to each resource in BC */
  companyName?: string;
  /** Capacity tooltip; defaults to the person's weekly capacity in words */
  describeCapacity?: (row: TeamTableRow) => string;
  /** Wording for the empty table, e.g. when a search matches nobody */
  emptyMessage?: string;
  /** Pencils to edit a person's target, capacity or GitHub username (Team page only) */
  onEditTarget?: (row: TeamTableRow) => void;
  onEditCapacity?: (row: TeamTableRow) => void;
  onEditGitHub?: (row: TeamTableRow) => void;
  /** Makes each name a button, e.g. to show just that person's report */
  onSelect?: (row: TeamTableRow) => void;
  /**
   * The sort, kept by the page so it survives the table unmounting while a new week or
   * period loads; without it the table keeps its own
   */
  sort?: TeamTableSort;
  onSortChange?: (sort: TeamTableSort) => void;
}

/**
 * The team's people with their hours, timesheet completion, capacity and billable %
 * against target, sortable by any column. Shared by the Team page and Reports so both
 * show people the same way.
 */
export function TeamTable({
  rows,
  targetsEnabled,
  showCapacity = true,
  showGitHub = false,
  companyName,
  describeCapacity = (row) => describeWeeklyCapacity(row.weekly),
  emptyMessage = 'No team members found',
  onEditTarget,
  onEditCapacity,
  onEditGitHub,
  onSelect,
  sort: controlledSort,
  onSortChange,
}: TeamTableProps) {
  const [ownSort, setOwnSort] = useState<TeamTableSort>(DEFAULT_TEAM_TABLE_SORT);
  const activeSort = controlledSort ?? ownSort;
  // A hidden column can't be the sort: fall back to the default until it's shown again
  const { field: sortField, direction: sortDirection } =
    !showCapacity && (activeSort.field === 'completion' || activeSort.field === 'capacity')
      ? DEFAULT_TEAM_TABLE_SORT
      : activeSort;
  const setSort = (next: TeamTableSort) => {
    setOwnSort(next);
    onSortChange?.(next);
  };

  const sortedRows = useMemo(() => {
    const result = [...rows];
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
  }, [rows, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    setSort({
      field,
      direction: sortField === field && sortDirection === 'asc' ? 'desc' : 'asc',
    });
  };

  // Sortable column header: full-opacity arrows on the sorted column
  const sortHeader = (
    field: SortField,
    label: string,
    { align = 'right', title }: { align?: 'left' | 'right'; title?: string } = {}
  ) => (
    <th
      key={field}
      className={cn(
        'text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-sm font-medium',
        align === 'left' ? 'text-left' : 'text-right'
      )}
      onClick={() => handleSort(field)}
      role="columnheader"
      aria-sort={
        sortField !== field ? 'none' : sortDirection === 'asc' ? 'ascending' : 'descending'
      }
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleSort(field)}
      title={title}
    >
      <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        <ChevronUpDownIcon
          className={cn('h-4 w-4 print:hidden', sortField !== field && 'opacity-50')}
        />
      </div>
    </th>
  );

  return (
    // In print the table shrinks to the page instead of scrolling (see globals.css)
    <Card variant="bordered" className="overflow-hidden print:overflow-visible">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-dark-700 bg-dark-800/50 border-b">
              {sortHeader('name', 'Employee', { align: 'left' })}
              {sortHeader('code', 'Code', { align: 'left' })}
              {sortHeader('totalHours', 'Hours')}
              {showCapacity &&
                sortHeader('completion', 'Timesheet completion', {
                  title: TIMESHEET_COMPLETION_DESCRIPTION,
                })}
              {showCapacity && sortHeader('capacity', 'Capacity')}
              {sortHeader(
                'billablePercent',
                targetsEnabled ? 'Billable % / target' : 'Billable %',
                {
                  title: BILLABLE_RULE_DESCRIPTION,
                }
              )}
              {targetsEnabled &&
                sortHeader('billableGap', 'Gap to target', { title: TARGET_GAP_DESCRIPTION })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((member) => (
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
                        {onSelect ? (
                          <button
                            type="button"
                            onClick={() => onSelect(member)}
                            className="hover:text-knowall-green text-left hover:underline"
                            title={`Show ${member.name}'s report`}
                          >
                            {member.name}
                          </button>
                        ) : (
                          member.name
                        )}
                        {member.isCurrentUser && (
                          <span className="text-knowall-green ml-2">(you)</span>
                        )}
                      </p>
                      {member.email && <p className="text-dark-400 text-xs">{member.email}</p>}
                      {showGitHub && (
                        <MemberGitHub
                          member={member}
                          onEdit={onEditGitHub ? () => onEditGitHub(member) : undefined}
                        />
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-dark-300">{member.number}</span>
                    {companyName && (
                      <a
                        href={getBCResourceUrl(
                          bcClient.tenantId,
                          bcClient.environment,
                          companyName,
                          member.number
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dark-400 hover:text-knowall-green print:hidden"
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
                    title={member.totalHours > 0 ? getStageSummary(member.stages) : undefined}
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
                {showCapacity && (
                  <>
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
                        title={describeCapacity(member)}
                      >
                        {member.weekly.flexible && (
                          <span
                            className="bg-dark-700 text-dark-300 cursor-help rounded px-1.5 py-0.5 text-xs"
                            title={describeFlexibleDays(member.weekly)}
                          >
                            <span aria-hidden="true">flexible</span>
                            <span className="sr-only">{describeFlexibleDays(member.weekly)}</span>
                          </span>
                        )}
                        <span className="tabular-nums">{member.capacity.toFixed(1)}</span>
                        {onEditCapacity && (
                          <button
                            type="button"
                            onClick={() => onEditCapacity(member)}
                            className="text-dark-400 hover:text-knowall-green rounded p-1 print:hidden"
                            title="Edit weekly capacity"
                            aria-label={`Edit weekly capacity for ${member.name}`}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
                <td className="px-4 py-3 text-right">
                  {member.weekly.excluded ? (
                    <span className="text-dark-400 text-sm">
                      {member.totalHours > 0 ? `${member.billablePercent.toFixed(0)}%` : '–'}
                    </span>
                  ) : member.target ? (
                    <div className="flex items-center justify-end gap-1">
                      <BillableTargetBadge
                        actualPercent={member.billablePercent}
                        target={member.target}
                        hasHours={member.totalHours > 0}
                      />
                      {onEditTarget && (
                        <button
                          type="button"
                          onClick={() => onEditTarget(member)}
                          className="text-dark-400 hover:text-knowall-green rounded p-1 print:hidden"
                          title="Edit billable target"
                          aria-label={`Edit billable target for ${member.name}`}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      )}
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
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={targetsEnabled ? 7 : 6} className="px-4 py-12 text-center">
                  <UserGroupIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
                  <p className="text-dark-400">{emptyMessage}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
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
  member: Pick<TeamTableRow, 'name' | 'githubUsername' | 'canEditConnectedAccounts'>;
  /** Omitted where usernames can't be changed (e.g. Reports) */
  onEdit?: () => void;
}) {
  const username = member.githubUsername ?? '';
  const profileUrl = getGitHubProfileUrl(username);
  const canEdit = !!onEdit && !!member.canEditConnectedAccounts;
  if (!profileUrl && !canEdit) return null;
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
      {canEdit && (
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
