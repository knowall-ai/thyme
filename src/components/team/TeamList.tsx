'use client';

import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Card, WeekNavigation, ExtensionPreviewWrapper } from '@/components/ui';
import { bcClient, ExtensionNotInstalledError } from '@/services/bc';
import { useCompanyStore } from '@/hooks';
import { useAuth, getUserProfilePhoto } from '@/services/auth';
import { getWeekStart } from '@/utils';
import { cn } from '@/utils';
import type { BCResource } from '@/types';
import { teamConfig, getUtilizationColor, getBillableColor } from '@/config';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

interface TeamMember {
  id: string;
  number: string; // Resource code/number from BC
  name: string;
  email: string;
  role: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  capacity: number;
  utilization: number; // percentage
  billablePercent: number; // percentage of total hours that are billable
  isCurrentUser: boolean; // Whether this resource belongs to the logged-in user
  photoUrl: string | null; // Azure AD profile photo URL
  userPrincipalName: string | null; // UPN for fetching profile photo
}

type SortField = 'name' | 'totalHours' | 'utilization' | 'billablePercent';
type SortDirection = 'asc' | 'desc';

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
  const { selectedCompany } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentUserInList, setCurrentUserInList] = useState(true);
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);

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
        // Get all person resources. Note: bcClient.getResources always applies
        // a hardcoded "type eq 'Person'" filter internally, and any additional
        // filters passed to it are AND-ed with that condition (they cannot override it).
        const resources = await bcClient.getResources();

        // Also check if current user has a resource record
        let currentUserResource: BCResource | null = null;
        if (userEmail) {
          currentUserResource = await bcClient.getResourceByEmail(userEmail);
          setCurrentUserInList(currentUserResource !== null);
        }

        // Get the current user's resource ID to mark them in the list
        const currentUserResourceId = currentUserResource?.id;

        // Extract domain from current user's email for deriving UPNs
        const emailDomain = userEmail ? userEmail.split('@')[1] : null;

        // Fetch hours for each resource for the selected week
        const membersWithHours = await Promise.all(
          resources.map(async (resource) => {
            const capacity = teamConfig.defaultCapacity;
            let totalHours = 0;
            let billableHours = 0;

            try {
              // Get timesheet for this resource
              const weekStartStr = currentWeekStart.toISOString().split('T')[0];
              const timesheets = await bcClient.getTimeSheets(resource.number, weekStartStr);

              if (timesheets.length > 0) {
                const timesheet = timesheets[0];
                const [lines, details] = await Promise.all([
                  bcClient.getTimeSheetLines(timesheet.number),
                  bcClient.getAllTimeSheetDetails(timesheet.number),
                ]);

                // Calculate hours from timesheet details
                for (const detail of details) {
                  if (detail.quantity > 0) {
                    const line = lines.find((l) => l.lineNo === detail.timeSheetLineNo);
                    if (line && line.type === 'Job') {
                      totalHours += detail.quantity;
                      // TODO: Currently all job entries are considered billable; update when BC exposes billable vs non-billable job types
                      billableHours += detail.quantity;
                    }
                  }
                }
              }
            } catch (error) {
              // Resource might not have a timesheet for this week - that's OK.
              // Log the error in development so unexpected failures are not silently ignored.
              if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.error(
                  'Failed to fetch timesheet data for resource',
                  resource.number,
                  'for week starting',
                  currentWeekStart.toISOString().split('T')[0],
                  error
                );
              }
            }

            const nonBillableHours = totalHours - billableHours;
            const utilization = capacity > 0 ? (totalHours / capacity) * 100 : 0;
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
              billableHours,
              nonBillableHours,
              capacity,
              utilization,
              billablePercent,
              isCurrentUser: resource.id === currentUserResourceId,
              photoUrl: null, // Will be fetched separately
              userPrincipalName,
            };
          })
        );

        setMembers(membersWithHours);

        // Fetch profile photos for members with UPNs (don't block initial render)
        void (async () => {
          try {
            const photoUpdates = await Promise.all(
              membersWithHours.map(async (member) => {
                if (!member.userPrincipalName) {
                  return null;
                }
                const photoUrl = await getUserProfilePhoto(member.userPrincipalName);
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
  }, [selectedCompany, currentWeekStart, userEmail]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalHours = members.reduce((sum, m) => sum + m.totalHours, 0);
    const billableHours = members.reduce((sum, m) => sum + m.billableHours, 0);
    const nonBillableHours = members.reduce((sum, m) => sum + m.nonBillableHours, 0);
    const totalCapacity = members.reduce((sum, m) => sum + m.capacity, 0);
    const utilization = totalCapacity > 0 ? (totalHours / totalCapacity) * 100 : 0;

    return { totalHours, billableHours, nonBillableHours, totalCapacity, utilization };
  }, [members]);

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
    let result = [...members];

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
        case 'totalHours':
          comparison = a.totalHours - b.totalHours;
          break;
        case 'utilization':
          comparison = a.utilization - b.utilization;
          break;
        case 'billablePercent':
          comparison = a.billablePercent - b.billablePercent;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [members, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4" />
    ) : (
      <ChevronDownIcon className="h-4 w-4" />
    );
  };

  // Get aria-sort value for accessible sortable headers
  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  // Get utilization status text for accessibility
  const getUtilizationStatus = (utilization: number): string => {
    if (utilization >= teamConfig.utilization.thresholds.high) {
      return 'on target';
    } else if (utilization >= teamConfig.utilization.thresholds.low) {
      return 'moderate';
    }
    return 'low - needs attention';
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {/* Total Hours */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm">Total Hours</p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.totalHours.toFixed(1)}
                </p>
              </Card>

              {/* Team Capacity */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm">Team Capacity</p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.totalCapacity.toFixed(1)}
                </p>
              </Card>

              {/* Utilization */}
              <Card variant="bordered" className="p-4">
                <p className="text-dark-400 text-sm">Utilization</p>
                <p className="text-dark-100 mt-1 text-2xl font-bold">
                  {totals.utilization.toFixed(0)}%
                </p>
                <div className="bg-dark-700 mt-2 h-4 w-full overflow-hidden rounded">
                  <div
                    className={cn('h-full rounded', getUtilizationColor(totals.utilization))}
                    style={{ width: `${Math.min(totals.utilization, 100)}%` }}
                  />
                </div>
              </Card>

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
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-green-500"></span>
                      <span className="text-dark-300">
                        Billable: {totals.billableHours.toFixed(1)}h
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-slate-500"></span>
                      <span className="text-dark-300">
                        Non-billable: {totals.nonBillableHours.toFixed(1)}h
                      </span>
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
                      <th className="text-dark-300 px-4 py-3 text-left text-sm font-medium">
                        Code
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
                        onClick={() => handleSort('utilization')}
                        role="columnheader"
                        aria-sort={getAriaSort('utilization')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('utilization')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Utilization
                          <SortIcon field="utilization" />
                        </div>
                      </th>
                      <th className="text-dark-300 px-4 py-3 text-right text-sm font-medium">
                        Capacity
                      </th>
                      <th
                        className="text-dark-300 hover:text-dark-100 cursor-pointer px-4 py-3 text-right text-sm font-medium"
                        onClick={() => handleSort('billablePercent')}
                        role="columnheader"
                        aria-sort={getAriaSort('billablePercent')}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('billablePercent')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Billable %
                          <SortIcon field="billablePercent" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedMembers.map((member) => (
                      <tr
                        key={member.id}
                        className="border-dark-700 hover:bg-dark-800/50 border-b last:border-b-0"
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
                              <p className="text-dark-400 text-xs">{member.email}</p>
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
                        <td className="text-dark-100 px-4 py-3 text-right">
                          {member.totalHours.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex flex-col gap-1"
                            role="meter"
                            aria-valuenow={member.utilization}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Utilization ${member.utilization.toFixed(0)}% - ${getUtilizationStatus(member.utilization)}`}
                          >
                            <span className="text-dark-100 text-sm font-medium">
                              {member.utilization.toFixed(0)}%
                            </span>
                            <div className="bg-dark-700 h-4 w-24 overflow-hidden rounded">
                              <div
                                className={cn('h-full', getUtilizationColor(member.utilization))}
                                style={{ width: `${Math.min(member.utilization, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-dark-300 px-4 py-3 text-right">
                          {member.capacity.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              getBillableColor(member.billablePercent)
                            )}
                            aria-label={`Billable percentage ${member.billablePercent.toFixed(0)}% - ${getBillableStatus(member.billablePercent)}`}
                          >
                            {member.billablePercent.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredAndSortedMembers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-dark-400 px-4 py-8 text-center">
                          {searchQuery
                            ? 'No team members match your search'
                            : 'No team members found'}
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
    </ExtensionPreviewWrapper>
  );
}
