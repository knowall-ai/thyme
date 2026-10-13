/**
 * Reports' client and project filters: which client each project belongs to, the
 * clients and projects to pick from, and people's hours restricted to the filter.
 *
 * A project's client is its bill-to customer. Internal projects (see isInternalProject:
 * no bill-to customer, an "Internal" one, or the company itself) are grouped under
 * one "Internal" client, matching the billable rule.
 */

import type { BCProject, TimeEntry } from '@/types';
import { isInternalProject } from './billable';
import { addStageHours, emptyStageHours, type StageHours } from './timesheetStatus';
import type { PersonHours, StagedTimeEntry } from './teamHours';

export interface ReportClient {
  /** `customer:<no.>`, or INTERNAL_CLIENT / UNKNOWN_CLIENT's id */
  id: string;
  name: string;
}

/** Every internal project's client */
export const INTERNAL_CLIENT: ReportClient = { id: 'internal', name: 'Internal' };

/** The client of a project that isn't in the projects list (e.g. it couldn't load) */
export const UNKNOWN_CLIENT: ReportClient = { id: 'unknown', name: 'Unknown client' };

export interface ReportProject {
  /** BC project number, as in TimeEntry.projectId */
  number: string;
  name: string;
  client: ReportClient;
}

/** The fields of a BC project needed for its name and client */
export type ReportProjectSource = Pick<
  BCProject,
  'displayName' | 'billToCustomerNo' | 'billToCustomerName' | 'billToIsCompany'
>;

/**
 * A project's name and client. `fallbackName` is used when the project isn't in
 * `source` (e.g. the name from the projects list).
 */
export function getReportProject(
  number: string,
  source?: ReportProjectSource,
  fallbackName?: string
): ReportProject {
  const name = source?.displayName?.trim() || fallbackName?.trim() || number || 'Unknown Project';
  if (!source) return { number, name, client: UNKNOWN_CLIENT };
  if (isInternalProject(source)) return { number, name, client: INTERNAL_CLIENT };
  const customerNo = source.billToCustomerNo?.trim() ?? '';
  return {
    number,
    name,
    client: {
      id: `customer:${customerNo}`,
      name: source.billToCustomerName?.trim() || customerNo,
    },
  };
}

/** Each project with time in `entries`, by number, with its name and client */
export function getReportProjects(
  entries: readonly Pick<TimeEntry, 'projectId'>[],
  projectsByNumber: ReadonlyMap<string, ReportProjectSource>,
  namesByNumber: ReadonlyMap<string, string> = new Map()
): Map<string, ReportProject> {
  const projects = new Map<string, ReportProject>();
  for (const { projectId } of entries) {
    if (projects.has(projectId)) continue;
    projects.set(
      projectId,
      getReportProject(projectId, projectsByNumber.get(projectId), namesByNumber.get(projectId))
    );
  }
  return projects;
}

/**
 * The report's client and project filter. An entry matches when it's on any of the
 * picked clients and any of the picked projects; an empty list matches everything.
 */
export interface ReportFilter {
  clientIds: readonly string[];
  projectNos: readonly string[];
}

export const NO_REPORT_FILTER: ReportFilter = { clientIds: [], projectNos: [] };

export function isReportFilterActive(filter: ReportFilter): boolean {
  return filter.clientIds.length > 0 || filter.projectNos.length > 0;
}

/** Whether an entry is on one of the filter's clients and one of its projects */
export function matchesReportFilter(
  entry: Pick<TimeEntry, 'projectId'>,
  filter: ReportFilter,
  projects: ReadonlyMap<string, ReportProject>
): boolean {
  if (filter.projectNos.length > 0 && !filter.projectNos.includes(entry.projectId)) return false;
  if (filter.clientIds.length > 0) {
    const clientId = projects.get(entry.projectId)?.client.id ?? UNKNOWN_CLIENT.id;
    if (!filter.clientIds.includes(clientId)) return false;
  }
  return true;
}

/** Adds a value to a multi-select filter's picks, or removes it if it's there */
export function toggleFilterValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * Picks the clients, keeping only the picked projects that are one of theirs (so the
 * project list, narrowed to those clients, always holds the picked projects)
 */
export function selectReportClients(
  filter: ReportFilter,
  clientIds: readonly string[],
  projects: ReadonlyMap<string, ReportProject>
): ReportFilter {
  const projectNos =
    clientIds.length === 0
      ? filter.projectNos
      : filter.projectNos.filter((number) => {
          const clientId = projects.get(number)?.client.id;
          return clientId !== undefined && clientIds.includes(clientId);
        });
  return { clientIds: [...clientIds], projectNos };
}

/**
 * A filter's picks in words: `allLabel` when nothing's picked, the names (comma
 * separated) when there are at most `maxNames`, otherwise how many, e.g. "3 clients"
 */
export function describeFilterSelection(
  names: readonly string[],
  allLabel: string,
  plural: string,
  maxNames = 1
): string {
  if (names.length === 0) return allLabel;
  if (names.length <= maxNames) return names.join(', ');
  return `${names.length} ${plural}`;
}

/** The names picked in each Reports filter (none for everything) */
export interface ReportFilterNames {
  clients: readonly string[];
  projects: readonly string[];
  resources: readonly string[];
}

/**
 * The Reports filters in words, e.g. "Adatum Corporation, Trey Research · All
 * projects · 3 resources": up to two names per filter, otherwise how many are picked
 */
export function describeReportFilters({ clients, projects, resources }: ReportFilterNames): string {
  return [
    describeFilterSelection(clients, 'All clients', 'clients', 2),
    describeFilterSelection(projects, 'All projects', 'projects', 2),
    describeFilterSelection(resources, 'All resources', 'resources', 2),
  ].join(' · ');
}

/** Hours by stage and billable hours for some entries */
export function sumEntryHours(entries: readonly StagedTimeEntry[]): {
  stages: StageHours;
  billableHours: number;
} {
  let stages = emptyStageHours();
  let billableHours = 0;
  for (const entry of entries) {
    stages = addStageHours(stages, entry.stages);
    if (entry.isBillable) billableHours += entry.hours;
  }
  return { stages, billableHours };
}

/**
 * A person's hours restricted to the entries kept: their stages and billable hours
 * are recalculated from those entries. Capacity is left as it is (it's all their
 * time, so Reports doesn't compare it with filtered hours).
 */
export function filterPersonHours<T extends PersonHours>(
  person: T,
  keep: (entry: StagedTimeEntry) => boolean
): T {
  const entries = person.entries.filter(keep);
  if (entries.length === person.entries.length) return person;
  return { ...person, entries, ...sumEntryHours(entries) };
}

const SPECIAL_CLIENT_ORDER: Record<string, number> = {
  [INTERNAL_CLIENT.id]: 1,
  [UNKNOWN_CLIENT.id]: 2,
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export interface ReportFilterOptions {
  /** Clients by name, with Internal and Unknown last */
  clients: ReportClient[];
  /** Projects by name: only the picked clients' when any are picked */
  projects: ReportProject[];
}

/** The clients and projects to pick from */
export function getReportFilterOptions(
  projects: Iterable<ReportProject>,
  clientIds: readonly string[] = []
): ReportFilterOptions {
  const all = [...projects];
  const clients = new Map<string, ReportClient>();
  // A project without the customer's name labels it by number; any project with the
  // name wins, whichever comes first
  const isBareNumber = (client: ReportClient) => client.id === `customer:${client.name}`;
  for (const { client } of all) {
    const existing = clients.get(client.id);
    if (!existing || (isBareNumber(existing) && !isBareNumber(client))) {
      clients.set(client.id, client);
    }
  }
  return {
    clients: [...clients.values()].sort(
      (a, b) =>
        (SPECIAL_CLIENT_ORDER[a.id] ?? 0) - (SPECIAL_CLIENT_ORDER[b.id] ?? 0) || byName(a, b)
    ),
    projects: all
      .filter((p) => clientIds.length === 0 || clientIds.includes(p.client.id))
      .sort((a, b) => byName(a, b) || a.number.localeCompare(b.number)),
  };
}

/** A project's hours in the report, split billable and by stage */
export interface ProjectStageHours {
  projectNo: string;
  hours: number;
  billableHours: number;
  /** `stages.total` equals `hours` */
  stages: StageHours;
}

/** Hours per project, most hours first */
export function getHoursByProject(entries: readonly StagedTimeEntry[]): ProjectStageHours[] {
  const byProject = new Map<string, ProjectStageHours>();
  for (const entry of entries) {
    const row = byProject.get(entry.projectId) ?? {
      projectNo: entry.projectId,
      hours: 0,
      billableHours: 0,
      stages: emptyStageHours(),
    };
    row.hours += entry.hours;
    if (entry.isBillable) row.billableHours += entry.hours;
    row.stages = addStageHours(row.stages, entry.stages);
    byProject.set(entry.projectId, row);
  }
  return [...byProject.values()].sort((a, b) => b.hours - a.hours);
}
