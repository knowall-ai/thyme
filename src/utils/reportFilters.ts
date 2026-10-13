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

/** The report's filter: null shows everything */
export interface ReportFilter {
  clientId: string | null;
  projectNo: string | null;
}

export const NO_REPORT_FILTER: ReportFilter = { clientId: null, projectNo: null };

export function isReportFilterActive(filter: ReportFilter): boolean {
  return filter.clientId !== null || filter.projectNo !== null;
}

/** Whether an entry is on the filter's client and project */
export function matchesReportFilter(
  entry: Pick<TimeEntry, 'projectId'>,
  filter: ReportFilter,
  projects: ReadonlyMap<string, ReportProject>
): boolean {
  if (filter.projectNo !== null && entry.projectId !== filter.projectNo) return false;
  if (filter.clientId !== null) {
    const clientId = projects.get(entry.projectId)?.client.id ?? UNKNOWN_CLIENT.id;
    if (clientId !== filter.clientId) return false;
  }
  return true;
}

/**
 * Picks a client, keeping the project only if it's that client's (so the project
 * list, narrowed to the client, always holds the picked project)
 */
export function selectReportClient(
  filter: ReportFilter,
  clientId: string | null,
  projects: ReadonlyMap<string, ReportProject>
): ReportFilter {
  const keepProject =
    filter.projectNo !== null &&
    (clientId === null || projects.get(filter.projectNo)?.client.id === clientId);
  return { clientId, projectNo: keepProject ? filter.projectNo : null };
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
  /** Projects by name, only the client's when `clientId` is set */
  projects: ReportProject[];
}

/** The clients and projects to pick from */
export function getReportFilterOptions(
  projects: Iterable<ReportProject>,
  clientId: string | null
): ReportFilterOptions {
  const all = [...projects];
  const clients = new Map<string, ReportClient>();
  for (const { client } of all) clients.set(client.id, client);
  return {
    clients: [...clients.values()].sort(
      (a, b) =>
        (SPECIAL_CLIENT_ORDER[a.id] ?? 0) - (SPECIAL_CLIENT_ORDER[b.id] ?? 0) || byName(a, b)
    ),
    projects: all
      .filter((p) => clientId === null || p.client.id === clientId)
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
