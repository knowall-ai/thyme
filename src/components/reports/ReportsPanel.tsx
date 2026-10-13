'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import {
  Card,
  ExtensionPreviewWrapper,
  StageBar,
  StageLegend,
  getStageSegments,
  getStageSummary,
} from '@/components/ui';
import { TeamTable, ProjectsUnavailableWarning, DEFAULT_TEAM_TABLE_SORT } from '@/components/team';
import type { TeamTableRow, TeamTableSort } from '@/components/team';
import { ExtensionNotInstalledError, loadTeamHours } from '@/services/bc';
import {
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  InformationCircleIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  XMarkIcon,
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
  getWeightedBillableTarget,
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
  NO_REPORT_FILTER,
  INTERNAL_CLIENT,
  UNKNOWN_CLIENT,
  isReportFilterActive,
  matchesReportFilter,
  filterPersonHours,
  getReportProject,
  getReportProjects,
  getReportFilterOptions,
  selectReportClients,
  describeFilterSelection,
  describeReportFilters,
  getHoursByProject,
  describeReportPrintout,
} from '@/utils';
import type {
  BillableTarget,
  PersonHours,
  ReportFilter,
  ReportFilterNames,
  ReportPeriod,
  WeeklyCapacity,
} from '@/utils';
import type { BCProject } from '@/types';
import { ExportButton } from './ExportButton';
import { FilterMenu } from './FilterMenu';
import { PrintButton } from './PrintButton';
import { ReportPeriodPicker } from './ReportPeriodPicker';

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// A bar segment narrower than this (% of the row) is left unlabelled: its hours are in
// the totals beside the bar, and e.g. "200h 45m" wouldn't fit
const MIN_LABELLED_SEGMENT = 7;

const BREAKDOWN_TITLES = {
  day: 'Daily Breakdown',
  week: 'Weekly Breakdown',
  month: 'Monthly Breakdown',
} as const;

const NO_PROJECTS: ReadonlyMap<string, BCProject> = new Map();

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
  // The period's projects (bill-to customers and names), from the same load
  const [projectsByNumber, setProjectsByNumber] = useState(NO_PROJECTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionNotInstalled, setExtensionNotInstalled] = useState(false);
  // The people picked by resource number, none for everyone (their data always comes
  // from the latest load, so a changed target or capacity is never stale)
  const [resourceNos, setResourceNos] = useState<string[]>([]);
  // Client and project: kept across periods, so stepping through weeks keeps the filter
  const [filter, setFilter] = useState<ReportFilter>(NO_REPORT_FILTER);
  // Kept here so it survives the people table unmounting while another period loads
  const [tableSort, setTableSort] = useState<TeamTableSort>(DEFAULT_TEAM_TABLE_SORT);

  const { projects, fetchProjects } = useProjectsStore();
  const { selectedCompany, companyVersion } = useCompanyStore();
  const { account } = useAuth();
  const userEmail = account?.username || '';
  const { from: startDate, to: endDate } = period;

  // Another company has other people, clients and projects: back to everything
  useEffect(() => {
    setResourceNos([]);
    setFilter(NO_REPORT_FILTER);
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
        setProjectsByNumber(loaded.projectsByNumber);
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

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Every project with time in the period, with its name and client (bill-to customer)
  const projectsByCode = useMemo(() => new Map(projects.map((p) => [p.code, p])), [projects]);
  const reportProjects = useMemo(
    () =>
      getReportProjects(
        people.flatMap((p) => p.entries),
        projectsByNumber,
        new Map(projects.map((p) => [p.code, p.name]))
      ),
    [people, projectsByNumber, projects]
  );
  const filterOptions = useMemo(
    () => getReportFilterOptions(reportProjects.values(), filter.clientIds),
    [reportProjects, filter.clientIds]
  );
  const filterActive = isReportFilterActive(filter);

  // Every client's name by id, including clients without time in this period (the
  // options' names win, as they have the period's projects)
  const clientNames = useMemo(() => {
    const all = getReportFilterOptions(
      [...projectsByNumber].map(([number, project]) => getReportProject(number, project))
    ).clients;
    return new Map(
      [INTERNAL_CLIENT, UNKNOWN_CLIENT, ...all, ...filterOptions.clients].map((c) => [c.id, c.name])
    );
  }, [projectsByNumber, filterOptions.clients]);

  // The picked clients, projects and people by name, even in a period without their time
  const filterNames: ReportFilterNames = useMemo(
    () => ({
      clients: filter.clientIds
        .map((id) => clientNames.get(id) ?? id.replace(/^customer:/, ''))
        .sort(byName),
      projects: filter.projectNos
        .map(
          (number) =>
            (
              reportProjects.get(number) ??
              getReportProject(
                number,
                projectsByNumber.get(number),
                projectsByCode.get(number)?.name
              )
            ).name
        )
        .sort(byName),
      resources: resourceNos
        .map((number) => resources.find((r) => r.number === number)?.name?.trim() || number)
        .sort(byName),
    }),
    [filter, clientNames, reportProjects, projectsByNumber, projectsByCode, resourceNos, resources]
  );
  // What the figures are restricted to, e.g. "Contoso Ltd.", two projects' names or
  // "3 projects" (the picked projects are all the picked clients')
  const filterDescription =
    filter.projectNos.length > 0
      ? describeFilterSelection(filterNames.projects, '', 'projects', 2)
      : filter.clientIds.length > 0
        ? describeFilterSelection(filterNames.clients, '', 'clients', 2)
        : null;

  // Everyone's hours restricted to the client and project: entries, stages and billable
  // hours alike, so every figure below follows the filter
  const filteredPeople = useMemo(
    () =>
      filterActive
        ? people.map((p) =>
            filterPersonHours(p, (entry) => matchesReportFilter(entry, filter, reportProjects))
          )
        : people,
    [people, filter, filterActive, reportProjects]
  );

  // The people in the selection: everyone, or those picked (by resource number, so
  // resources whose time sheets share an owner never pick up each other's time)
  const selectedPeople = useMemo(() => {
    // Everyone means the people who count: not those on a weekly capacity of 0. Anyone
    // picked counts, as they were asked for
    if (resourceNos.length === 0) return filteredPeople.filter(isCounted);
    return filteredPeople.filter((p) => resourceNos.includes(p.resource.number));
  }, [filteredPeople, resourceNos]);
  // The one person picked, whose report it is (their own target, no People table)
  const selectedPerson = resourceNos.length === 1 ? (selectedPeople[0] ?? null) : null;
  const entries = useMemo(() => selectedPeople.flatMap((p) => p.entries), [selectedPeople]);

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

  // The counted people's targets weighted by capacity, exactly as the Team page's team
  // target: for everyone, or for several people picked (anyone not counted has none)
  const weightedTarget = useMemo(
    () =>
      companyDefault === null
        ? null
        : getWeightedBillableTarget(
            selectedPeople.filter(isCounted).map((p) => ({
              capacity: p.capacity,
              targetPercent: resolveBillableTarget(p.resource, companyDefault).percent,
            }))
          ),
    [selectedPeople, companyDefault]
  );

  // Billable target for the selection: one person's own (or the company default), or
  // the weighted target of everyone (the team target) or of the people picked. None
  // under a client or project filter: targets are for all of a person's time, and one
  // client's work is nearly all billable (or, for Internal, none of it)
  const billableTarget: BillableTarget | null = filterActive
    ? null
    : selectedPerson
      ? targetOf(selectedPerson)
      : weightedTarget === null || !targetsEnabled
        ? null
        : { percent: weightedTarget, isDefault: false };
  const billableTargetName =
    resourceNos.length === 0
      ? 'team target'
      : resourceNos.length > 1
        ? 'combined target'
        : billableTarget?.isDefault
          ? 'default target'
          : 'target';

  const uniqueProjects = useMemo(() => new Set(entries.map((e) => e.projectId)).size, [entries]);

  // Everyone (or the people picked) in the Team page's table, for the period: capacity
  // and completion scale with the period's working days (one week = their weekly
  // capacity). Under a client or project filter, only the people with time on it, and
  // no targets (see billableTarget)
  const tableRows = useMemo(
    (): TeamTableRow[] =>
      filteredPeople
        .filter(
          (p) =>
            (resourceNos.length === 0 || resourceNos.includes(p.resource.number)) &&
            (!filterActive || p.stages.total > 0)
        )
        .map((p) => {
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
              companyDefault !== null && !weekly.excluded && !filterActive
                ? resolveBillableTarget(p.resource, companyDefault)
                : null,
          };
        }),
    [filteredPeople, resourceNos, filterActive, photos, startDate, endDate, companyDefault]
  );

  // Hours by project, split by stage as on the project page's Time Spent card
  const projectHours = useMemo(
    () =>
      getHoursByProject(entries).map((row) => ({
        ...row,
        projectName: reportProjects.get(row.projectNo)?.name || 'Unknown Project',
        projectColor: projectsByCode.get(row.projectNo)?.color || '#6B7280',
      })),
    [entries, reportProjects, projectsByCode]
  );
  const projectStageSegments = getStageSegments(summary.stages);

  // Hours per day, week or month (by the period's length), billable and unbillable,
  // against the selection's capacity for each row
  const granularity = getBreakdownGranularity(period);
  const breakdown = useMemo((): BreakdownRow[] => {
    // Daily capacity of the selected people: their weekly capacity over 5 working days.
    // None under a client or project filter: capacity is for all their time
    const dailyCapacity = filterActive ? 0 : summary.capacity / 5;
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
  }, [entries, period, granularity, summary.capacity, filterActive]);

  // Find max hours for bar chart scaling
  const maxProjectHours = Math.max(...projectHours.map((p) => p.hours), 1);
  // Use the greater of capacity or max hours to ensure bars fit
  const maxRowHours = Math.max(...breakdown.map((row) => Math.max(row.hours, row.capacity)), 1);

  const hasHours = summary.totalHours > 0;

  // The printed report's heading: its period and filters, as the filter bar is hidden
  const printSummary = describeReportPrintout(period, [describeReportFilters(filterNames)]);
  const billableBand = billableTarget
    ? getBillableTargetBand(summary.billablePercent, billableTarget.percent, hasHours)
    : null;

  return (
    <ExtensionPreviewWrapper extensionNotInstalled={extensionNotInstalled} pageName="Reports">
      <div className="space-y-6">
        <p className="hidden text-xl font-bold text-white print:block">{printSummary}</p>

        {/* Period, and the client, project and resource filters (hidden in print) */}
        <ReportPeriodPicker period={period} onChange={setPeriod} actions={<PrintButton />}>
          {(filterActive || resourceNos.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setFilter(NO_REPORT_FILTER);
                setResourceNos([]);
              }}
              className="text-dark-300 hover:text-thyme-400 flex h-10 items-center gap-1 rounded-lg px-2 text-sm transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
              Clear filters
            </button>
          )}
          <FilterMenu
            label="Client"
            allLabel="All Clients"
            pluralLabel="clients"
            icon={BuildingOfficeIcon}
            values={filter.clientIds}
            valueLabels={filterNames.clients}
            options={filterOptions.clients.map((client) => {
              const count = [...reportProjects.values()].filter(
                (p) => p.client.id === client.id
              ).length;
              return {
                value: client.id,
                label: client.name,
                description: `${count} project${count === 1 ? '' : 's'}`,
              };
            })}
            onChange={(clientIds) =>
              setFilter((current) => selectReportClients(current, clientIds, reportProjects))
            }
            isLoading={isLoading && reportProjects.size === 0}
            emptyMessage="No client time in this period"
          />
          <FilterMenu
            label="Project"
            allLabel={
              filter.clientIds.length === 1
                ? `All ${filterNames.clients[0]} Projects`
                : 'All Projects'
            }
            pluralLabel="projects"
            icon={BriefcaseIcon}
            values={filter.projectNos}
            valueLabels={filterNames.projects}
            options={filterOptions.projects.map((project) => ({
              value: project.number,
              label: project.name,
              // The client too, unless only one client's projects are listed
              description:
                filter.clientIds.length === 1
                  ? project.number
                  : `${project.number} · ${project.client.name}`,
              color: projectsByCode.get(project.number)?.color,
            }))}
            onChange={(projectNos) => setFilter((current) => ({ ...current, projectNos }))}
            isLoading={isLoading && reportProjects.size === 0}
            emptyMessage="No project time in this period"
          />
          <FilterMenu
            label="Resource"
            allLabel="All Resources"
            pluralLabel="resources"
            icon={UsersIcon}
            values={resourceNos}
            valueLabels={filterNames.resources}
            options={resources.map((resource) => ({
              value: resource.number,
              label: resource.name?.trim() || 'Unknown',
              description: resource.number,
            }))}
            onChange={setResourceNos}
            isLoading={isLoadingResources}
            emptyMessage="No resources"
          />
        </ReportPeriodPicker>

        {!isLoading && projectsUnavailable && <ProjectsUnavailableWarning />}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 print:grid-cols-4">
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
                    title={
                      selectedPerson
                        ? BILLABLE_TARGET_BAND_LABELS[billableBand]
                        : `${BILLABLE_TARGET_BAND_LABELS[billableBand]}. The ${billableTargetName} is ${resourceNos.length === 0 ? "the team's" : "the selected people's"} targets, weighted by capacity.`
                    }
                  >
                    {billableTarget.percent.toFixed(0)}% {billableTargetName}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* People: the Team page's table for the period, of everyone or the people
            picked (not for one person: the report is theirs) */}
        {!selectedPerson && !isLoading && !error && tableRows.length > 0 && (
          <section className="space-y-3" aria-labelledby="report-people">
            <div>
              <h2 id="report-people" className="text-lg font-semibold text-white">
                People
              </h2>
              {filterDescription && (
                <p className="text-dark-400 mt-1 text-sm">
                  Hours on {filterDescription} only. Timesheet completion, capacity and billable
                  targets are hidden: they cover all of each person&apos;s time, not one
                  client&apos;s or project&apos;s.
                </p>
              )}
            </div>
            <TeamTable
              rows={tableRows}
              targetsEnabled={targetsEnabled && !filterActive}
              showCapacity={!filterActive}
              companyName={selectedCompany?.name}
              describeCapacity={(row) =>
                row.weekly.excluded
                  ? describeWeeklyCapacity(row.weekly)
                  : `${row.capacity.toFixed(1)}h for this period: ${describeWeeklyCapacity(row.weekly)}, for every 5 working days`
              }
              // Just that person's report, in place of any people picked
              onSelect={(row) => setResourceNos([row.number])}
              sort={tableSort}
              onSortChange={setTableSort}
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
              {filterDescription ? (
                <p>No time on {filterDescription} for this period</p>
              ) : (
                <>
                  <p>No time entries found for this period</p>
                  <p className="mt-1 text-sm">Start tracking time to see your reports here</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* The stages' colours, as on the project page's Time Spent card */}
              <StageLegend segments={projectStageSegments} formatHours={formatTime} />
              {projectHours.map((project) => (
                <div
                  key={project.projectNo}
                  className="break-inside-avoid space-y-2"
                  title={getStageSummary(project.stages, formatTime)}
                >
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
                  {/* Hours by stage; the longest project fills the bar */}
                  <StageBar
                    segments={getStageSegments(project.stages)}
                    max={maxProjectHours}
                    className="bg-dark-700 h-2"
                  />
                  <span className="sr-only">{getStageSummary(project.stages, formatTime)}</span>
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
              <p>
                {filterDescription
                  ? `No time on ${filterDescription} for this period`
                  : 'No time entries found for this period'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {breakdown.map((row) => {
                const unbillableHours = row.hours - row.billableHours;
                const billableWidth = (row.billableHours / maxRowHours) * 100;
                const unbillableWidth = (unbillableHours / maxRowHours) * 100;

                return (
                  <div key={row.key} className="flex break-inside-avoid items-center gap-4">
                    <span className="text-dark-400 w-28 text-sm">{row.label}</span>
                    <div className="bg-dark-700 relative h-6 flex-1 overflow-hidden rounded">
                      {row.hours > 0 && (
                        <div className="absolute inset-0 flex">
                          {/* Billable segment */}
                          {row.billableHours > 0 && (
                            <div
                              className="bg-thyme-600 flex h-full items-center overflow-hidden px-2 transition-all duration-500"
                              style={{
                                width: `${billableWidth}%`,
                                minWidth: '24px',
                              }}
                            >
                              {billableWidth >= MIN_LABELLED_SEGMENT && (
                                <span className="text-xs font-medium whitespace-nowrap text-white">
                                  {formatTime(row.billableHours)}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Unbillable segment */}
                          {unbillableHours > 0 && (
                            <div
                              className="flex h-full items-center overflow-hidden bg-slate-500 px-2 transition-all duration-500"
                              style={{
                                width: `${unbillableWidth}%`,
                                minWidth: '24px',
                              }}
                            >
                              {unbillableWidth >= MIN_LABELLED_SEGMENT && (
                                <span className="text-xs font-medium whitespace-nowrap text-white">
                                  {formatTime(unbillableHours)}
                                </span>
                              )}
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
