'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import { Card, ExtensionPreviewWrapper } from '@/components/ui';
import { TeamTable, ProjectsUnavailableWarning } from '@/components/team';
import type { TeamTableRow } from '@/components/team';
import { ExtensionNotInstalledError, loadTeamHours } from '@/services/bc';
import {
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ChevronDownIcon,
  UserIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import {
  useProjectsStore,
  useCompanyStore,
  useBillableTargetStore,
  useResourcePhotos,
} from '@/hooks';
import { useAuth } from '@/services/auth';
import {
  cn,
  formatTime,
  BILLABLE_RULE_DESCRIPTION,
  hasBillableTargetFields,
  resolveBillableTarget,
  resolveCompanyDefault,
  summariseHours,
  isCounted,
  getBillableTargetBand,
  BILLABLE_TARGET_BAND_COLORS,
  BILLABLE_TARGET_BAND_LABELS,
  describeWeeklyCapacity,
  withWeeklyCapacityFields,
  getPresetPeriod,
  getPeriodCapacity,
  getBreakdownBuckets,
  getBreakdownGranularity,
} from '@/utils';
import type { BillableTarget, PersonHours, ReportPeriod, WeeklyCapacity } from '@/utils';
import { ExportButton } from './ExportButton';
import { ReportPeriodPicker } from './ReportPeriodPicker';

const EVERYONE = 'everyone';

const BREAKDOWN_TITLES = {
  day: 'Daily Breakdown',
  week: 'Weekly Breakdown',
  month: 'Monthly Breakdown',
} as const;

interface ProjectHours {
  projectId: string;
  projectName: string;
  projectColor: string;
  hours: number;
  billableHours: number;
}

interface BreakdownRow {
  key: string;
  label: string;
  hours: number;
  billableHours: number;
  /** The selection's capacity for the row (0 for a weekend day) */
  capacity: number;
}

// Explains which time counts as billable, next to the billable figures
function BillableInfo({ label }: { label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();

  return (
    // Hover is tracked on the wrapper so the pointer can move onto the tooltip
    <span
      className="relative inline-flex print:hidden"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="focus:ring-thyme-500 focus:ring-offset-dark-800 flex cursor-help rounded text-gray-600 hover:text-gray-400 focus:ring-1 focus:ring-offset-1 focus:outline-none"
        // Keyboard focus opens it; a tap (which may also focus) is handled by onClick
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        // Tap to show or hide it on touch screens. Enter/Space clicks (detail 0) keep it
        // open, since keyboard focus has already shown it
        onClick={(e) => setIsOpen((open) => (e.detail === 0 ? true : !open))}
        onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
        aria-label={`Info: ${label}`}
        aria-describedby={tooltipId}
        aria-expanded={isOpen}
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>
      {/* Always rendered (hidden when closed) so aria-describedby can read it. The top
          padding bridges the gap to the button, so hover isn't lost on the way across */}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn('absolute top-full left-0 z-20 w-64 pt-2', !isOpen && 'hidden')}
      >
        <span className="bg-dark-700 block rounded px-3 py-2 text-xs text-gray-300 shadow-lg">
          {BILLABLE_RULE_DESCRIPTION}
        </span>
      </span>
    </span>
  );
}

// A person's weekly capacity; loadTeamHours always sets `weekly`
const weeklyOf = (person: PersonHours): WeeklyCapacity =>
  person.weekly ??
  withWeeklyCapacityFields(
    { hoursPerDay: person.capacity / 5, defaultHours: person.capacity },
    person.resource
  );

export function ReportsPanel() {
  const [period, setPeriod] = useState<ReportPeriod>(() => getPresetPeriod('thisWeek'));
  const [people, setPeople] = useState<PersonHours[]>([]);
  const [projectsUnavailable, setProjectsUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  // Everyone, or one person by resource number (their data always comes from the
  // latest load, so a changed target or capacity is never stale)
  const [selectedNo, setSelectedNo] = useState<string>(EVERYONE);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const { projects, fetchProjects } = useProjectsStore();
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';
  const { from: startDate, to: endDate } = period;

  // Another company has other people: back to everyone
  useEffect(() => {
    setSelectedNo(EVERYONE);
  }, [companyVersion]);

  // The team and their hours for the period: the same calculation as the Team page
  // (loadTeamHours), so both agree for the same week
  useEffect(() => {
    let cancelled = false;
    const fetchTeamHours = async () => {
      setIsLoading(true);
      setError(null);
      setExtensionNotInstalled(false);
      try {
        const loaded = await loadTeamHours(startDate, endDate);
        if (cancelled) return;
        setPeople(loaded.people);
        setProjectsUnavailable(loaded.projectsUnavailable);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ExtensionNotInstalledError) {
          setExtensionNotInstalled(true);
        } else {
          console.error('Failed to load report data:', err);
          setError('Failed to load report data');
        }
        setPeople([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchTeamHours();
    return () => {
      cancelled = true;
    };
    // companyVersion ensures refetch when company switches
  }, [startDate, endDate, companyVersion]);

  const resources = useMemo(() => people.map((p) => p.resource), [people]);
  const isLoadingResources = isLoading && resources.length === 0;
  const photos = useResourcePhotos(resources, userEmail);

  const selectedPerson =
    selectedNo === EVERYONE ? null : (people.find((p) => p.resource.number === selectedNo) ?? null);

  // The people in the selection: everyone, or the one picked (by resource number, so
  // resources whose time sheets share an owner never pick up each other's time)
  const selectedPeople = useMemo(() => {
    // Everyone means the people who count: not those on a weekly capacity of 0
    if (selectedNo === EVERYONE) return people.filter(isCounted);
    return people.filter((p) => p.resource.number === selectedNo);
  }, [people, selectedNo]);
  const entries = useMemo(() => selectedPeople.flatMap((p) => p.entries), [selectedPeople]);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Billable targets: each person's own (or the company default). Null on Thyme BC
  // Extensions without targets, and until this company's Thyme Setup has loaded.
  const { companyDefaultPercent, setupAvailable, loadedForCompanyVersion, loadCompanyDefault } =
    useBillableTargetStore();
  const targetFieldsPresent = hasBillableTargetFields(resources);
  useEffect(() => {
    if (targetFieldsPresent) void loadCompanyDefault(companyVersion);
  }, [targetFieldsPresent, companyVersion, loadCompanyDefault]);
  // Only once this company's Thyme Setup has loaded (never another company's default)
  const targetsEnabled =
    targetFieldsPresent && setupAvailable === true && loadedForCompanyVersion === companyVersion;
  const companyDefault = targetsEnabled ? resolveCompanyDefault(companyDefaultPercent) : null;
  // A person's effective target; none for someone not counted, as on the Team page
  const targetOf = (person: PersonHours): BillableTarget | null =>
    companyDefault !== null && isCounted(person)
      ? resolveBillableTarget(person.resource, companyDefault)
      : null;

  // Totals for the selection: the same calculation as the Team page's summary
  const summary = useMemo(
    () =>
      summariseHours(
        selectedPeople.map((p) => ({
          ...p,
          targetPercent:
            companyDefault !== null && isCounted(p)
              ? resolveBillableTarget(p.resource, companyDefault).percent
              : null,
        }))
      ),
    [selectedPeople, companyDefault]
  );

  // Billable target for the selection: the person's own (or the company default), or for
  // everyone the team target, weighted by capacity exactly as on the Team page
  const billableTarget: BillableTarget | null = selectedPerson
    ? targetOf(selectedPerson)
    : summary.billableTarget === null || !targetsEnabled
      ? null
      : { percent: summary.billableTarget, isDefault: false };

  const uniqueProjects = useMemo(() => new Set(entries.map((e) => e.projectId)).size, [entries]);

  // Everyone in the Team page's table, for the period: capacity and completion scale
  // with the period's working days (one week = their weekly capacity)
  const tableRows = useMemo(
    (): TeamTableRow[] =>
      people.map((p) => {
        const weekly = weeklyOf(p);
        const totalHours = p.stages.total;
        const capacity = getPeriodCapacity(weekly.hours, startDate, endDate);
        return {
          id: p.resource.id,
          number: p.resource.number,
          name: p.resource.name || p.resource.displayName || p.resource.number,
          email: '',
          totalHours,
          stages: p.stages,
          billablePercent: totalHours > 0 ? (p.billableHours / totalHours) * 100 : 0,
          isCurrentUser: false,
          photoUrl: photos[p.resource.id] ?? null,
          weekly,
          capacity,
          completion: weekly.excluded ? null : capacity > 0 ? (totalHours / capacity) * 100 : 0,
          target:
            companyDefault !== null && !weekly.excluded
              ? resolveBillableTarget(p.resource, companyDefault)
              : null,
        };
      }),
    [people, photos, startDate, endDate, companyDefault]
  );

  // Calculate hours by project
  const projectHours = useMemo((): ProjectHours[] => {
    const projectMap = new Map<string, { hours: number; billableHours: number }>();

    entries.forEach((entry) => {
      const existing = projectMap.get(entry.projectId) || { hours: 0, billableHours: 0 };
      existing.hours += entry.hours;
      if (entry.isBillable) {
        existing.billableHours += entry.hours;
      }
      projectMap.set(entry.projectId, existing);
    });

    return Array.from(projectMap.entries())
      .map(([projectId, data]) => {
        const project = projects.find((p) => p.code === projectId);
        return {
          projectId,
          projectName: project?.name || 'Unknown Project',
          projectColor: project?.color || '#6B7280',
          hours: data.hours,
          billableHours: data.billableHours,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [entries, projects]);

  // Hours per day, week or month (by the period's length), billable and unbillable,
  // against the selection's capacity for each row
  const granularity = getBreakdownGranularity(period);
  const breakdown = useMemo((): BreakdownRow[] => {
    // Daily capacity of the selected people: their weekly capacity over 5 working days
    const dailyCapacity = summary.capacity / 5;
    const rows = getBreakdownBuckets(period, granularity).map((bucket) => ({
      ...bucket,
      hours: 0,
      billableHours: 0,
      capacity: dailyCapacity * bucket.weekdays,
    }));
    for (const entry of entries) {
      const row = rows.find((r) => entry.date >= r.from && entry.date <= r.to);
      if (!row) continue;
      row.hours += entry.hours;
      if (entry.isBillable) row.billableHours += entry.hours;
    }
    return rows;
  }, [entries, period, granularity, summary.capacity]);

  // Find max hours for bar chart scaling
  const maxProjectHours = Math.max(...projectHours.map((p) => p.hours), 1);
  // Use the greater of capacity or max hours to ensure bars fit
  const maxRowHours = Math.max(...breakdown.map((row) => Math.max(row.hours, row.capacity)), 1);

  const hasHours = summary.totalHours > 0;
  const billableBand = billableTarget
    ? getBillableTargetBand(summary.billablePercent, billableTarget.percent, hasHours)
    : null;

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Reports">
      <div className="space-y-6">
        {/* Period and resource selector */}
        <ReportPeriodPicker period={period} onChange={setPeriod}>
          {/* Team Member Filter */}
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                'flex h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                'border-dark-600 bg-dark-700 hover:border-dark-500 hover:bg-dark-600 border',
                isFilterOpen && 'border-thyme-500'
              )}
            >
              <UsersIcon className="text-dark-400 h-4 w-4" />
              <span className="text-dark-200">
                {selectedNo === EVERYONE
                  ? 'All Resources'
                  : selectedPerson?.resource.name?.trim() || selectedNo}
              </span>
              <ChevronDownIcon
                className={cn(
                  'text-dark-400 h-4 w-4 transition-transform',
                  isFilterOpen && 'rotate-180'
                )}
              />
            </button>

            {isFilterOpen && (
              <div className="border-dark-600 bg-dark-800 absolute right-0 z-50 mt-2 w-64 rounded-lg border shadow-xl">
                <div className="border-dark-600 border-b px-4 py-3">
                  <h3 className="text-sm font-medium text-white">Filter by Resource</h3>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {/* All Resources option */}
                  <button
                    onClick={() => {
                      setSelectedNo(EVERYONE);
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                      selectedNo === EVERYONE && 'bg-dark-700'
                    )}
                  >
                    <UsersIcon className="text-thyme-500 h-5 w-5" />
                    <span className="text-dark-200">All Resources</span>
                  </button>

                  {/* Individual resources */}
                  {isLoadingResources ? (
                    <div className="text-dark-400 px-4 py-3 text-center text-sm">Loading...</div>
                  ) : (
                    resources.map((resource) => (
                      <button
                        key={resource.id}
                        onClick={() => {
                          setSelectedNo(resource.number);
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          'hover:bg-dark-700 flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                          selectedNo === resource.number && 'bg-dark-700'
                        )}
                      >
                        <UserIcon className="text-dark-400 h-5 w-5" />
                        <div className="flex-1 truncate">
                          <div className="text-dark-200">{resource.name?.trim() || 'Unknown'}</div>
                          <div className="text-dark-500 text-xs">{resource.number}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </ReportPeriodPicker>

        {!isLoading && projectsUnavailable && <ProjectsUnavailableWarning />}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-thyme-500/20 rounded-lg p-2">
                <ClockIcon className="text-thyme-500 h-5 w-5" />
              </div>
              <div>
                <p className="text-dark-400 text-sm">Total Hours</p>
                <p className="text-dark-100 text-xl font-bold">
                  {isLoading ? '...' : formatTime(summary.totalHours)}
                </p>
              </div>
            </div>
          </Card>
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/20 p-2">
                <ChartBarIcon className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-dark-400 flex items-center gap-1 text-sm">
                  Billable Hours
                  <BillableInfo label="Billable Hours" />
                </p>
                <p className="text-dark-100 text-xl font-bold">
                  {isLoading ? '...' : formatTime(summary.billableHours)}
                </p>
              </div>
            </div>
          </Card>
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/20 p-2">
                <ChartBarIcon className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-dark-400 text-sm">Projects</p>
                <p className="text-dark-100 text-xl font-bold">
                  {isLoading ? '...' : uniqueProjects}
                </p>
              </div>
            </div>
          </Card>
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/20 p-2">
                <ChartBarIcon className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-dark-400 flex items-center gap-1 text-sm">
                  Billable %
                  <BillableInfo label="Billable %" />
                </p>
                <p className="text-dark-100 text-xl font-bold">
                  {isLoading ? '...' : hasHours ? `${summary.billablePercent.toFixed(0)}%` : '–'}
                </p>
                {/* Coloured by the unrounded %, as on the Team page */}
                {billableTarget && billableBand && !isLoading && (
                  <p
                    className={cn(
                      'mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      BILLABLE_TARGET_BAND_COLORS[billableBand]
                    )}
                    title={BILLABLE_TARGET_BAND_LABELS[billableBand]}
                  >
                    {billableTarget.percent.toFixed(0)}%{' '}
                    {selectedNo === EVERYONE
                      ? 'team target'
                      : billableTarget.isDefault
                        ? 'default target'
                        : 'target'}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* People: the Team page's table for the period */}
        {selectedNo === EVERYONE && !isLoading && !error && tableRows.length > 0 && (
          <section className="space-y-3" aria-labelledby="report-people">
            <h2 id="report-people" className="text-lg font-semibold text-white">
              People
            </h2>
            <TeamTable
              rows={tableRows}
              targetsEnabled={targetsEnabled}
              companyName={selectedCompany?.name}
              describeCapacity={(row) =>
                row.weekly.excluded
                  ? describeWeeklyCapacity(row.weekly)
                  : `${row.capacity.toFixed(1)}h for this period: ${describeWeeklyCapacity(row.weekly)}, for every 5 working days`
              }
              onSelect={(row) => setSelectedNo(row.number)}
            />
          </section>
        )}

        {/* Project Breakdown */}
        <Card variant="bordered" className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Hours by Project</h2>
            <ExportButton
              entries={entries}
              projects={projects}
              fileSuffix={`${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}`}
            />
          </div>
          {isLoading ? (
            <div className="text-dark-400 py-12 text-center">
              <div className="border-dark-600 border-t-thyme-500 mx-auto h-8 w-8 animate-spin rounded-full border-2"></div>
              <p className="mt-4">Loading...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-thyme-500 hover:text-thyme-400 underline"
              >
                Try again
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-dark-400 py-12 text-center">
              <ChartBarIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
              <p>No time entries found for this period</p>
              <p className="mt-1 text-sm">Start tracking time to see your reports here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projectHours.map((project) => (
                <div key={project.projectId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: project.projectColor }}
                      />
                      <span className="text-dark-100 text-sm font-medium">
                        {project.projectName}
                      </span>
                    </div>
                    <span className="text-dark-400 text-sm">{formatTime(project.hours)}</span>
                  </div>
                  <div className="bg-dark-700 relative h-2 overflow-hidden rounded-full">
                    <div
                      className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(project.hours / maxProjectHours) * 100}%`,
                        backgroundColor: project.projectColor,
                      }}
                    />
                  </div>
                  {project.billableHours > 0 && (
                    <p className="text-dark-500 text-xs">
                      {formatTime(project.billableHours)} billable
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Day, week or month breakdown */}
        <Card variant="bordered" className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{BREAKDOWN_TITLES[granularity]}</h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="bg-thyme-600 h-3 w-3 rounded-sm" />
                <span className="text-dark-300">Billable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-slate-500" />
                <span className="text-dark-300">Unbillable</span>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="text-dark-400 py-12 text-center">
              <div className="border-dark-600 border-t-thyme-500 mx-auto h-8 w-8 animate-spin rounded-full border-2"></div>
              <p className="mt-4">Loading...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-red-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-thyme-500 hover:text-thyme-400 underline"
              >
                Try again
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-dark-400 py-12 text-center">
              <CalendarIcon className="text-dark-600 mx-auto mb-4 h-12 w-12" />
              <p>No time entries found for this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {breakdown.map((row) => {
                const unbillableHours = row.hours - row.billableHours;
                const billableWidth = (row.billableHours / maxRowHours) * 100;
                const unbillableWidth = (unbillableHours / maxRowHours) * 100;

                return (
                  <div key={row.key} className="flex items-center gap-4">
                    <span className="text-dark-400 w-28 text-sm">{row.label}</span>
                    <div className="bg-dark-700 relative h-6 flex-1 overflow-hidden rounded">
                      {row.hours > 0 && (
                        <div className="absolute top-0 left-0 flex h-full">
                          {/* Billable segment */}
                          {row.billableHours > 0 && (
                            <div
                              className="bg-thyme-600 flex h-full items-center px-2 transition-all duration-500"
                              style={{
                                width: `${billableWidth}%`,
                                minWidth: '24px',
                              }}
                            >
                              <span className="text-xs font-medium text-white">
                                {formatTime(row.billableHours)}
                              </span>
                            </div>
                          )}
                          {/* Unbillable segment */}
                          {unbillableHours > 0 && (
                            <div
                              className="flex h-full items-center bg-slate-500 px-2 transition-all duration-500"
                              style={{
                                width: `${unbillableWidth}%`,
                                minWidth: '24px',
                              }}
                            >
                              <span className="text-xs font-medium text-white">
                                {formatTime(unbillableHours)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-dark-300 w-36 text-right text-xs">
                      <span className="text-thyme-400">{formatTime(row.billableHours)}</span>
                      {' + '}
                      <span className="text-slate-400">{formatTime(unbillableHours)}</span>
                      {row.capacity > 0 && (
                        <span className="text-dark-500">
                          {' '}
                          / {Math.round(row.capacity * 10) / 10}h
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </ExtensionPreviewWrapper>
  );
}
