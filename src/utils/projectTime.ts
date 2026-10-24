/**
 * Time spent on projects, worked out one way for both the project page's Time Spent card
 * and the Projects list, so the two can't drift apart.
 */

import type { BCTimeSheetDetail, BCTimeSheetLine } from '@/types';
import { getPostedHours, type StageHours } from './timesheetStatus';
import { isAiResource } from './aiResources';

/** One day's hours on a project, with the timesheet line they were logged on */
export interface ProjectTimeRow {
  jobNo: string;
  resourceNo: string;
  line: BCTimeSheetLine;
  detail: BCTimeSheetDetail;
}

/**
 * The timesheet hours that count as time spent on projects: each day's hours on a Job
 * line that has hours, logged by a person resource (personResourceNos, from getResources).
 * Details don't carry the resource, so it comes from the parent timesheet. All time
 * counts, however old. jobNo: only that project's hours.
 */
export function collectProjectTimeRows(
  lines: BCTimeSheetLine[],
  details: BCTimeSheetDetail[],
  resourceNoByTimesheet: ReadonlyMap<string, string>,
  personResourceNos: ReadonlySet<string>,
  jobNo?: string
): ProjectTimeRow[] {
  const linesByKey = new Map<string, BCTimeSheetLine>();
  for (const line of lines) {
    if (line.type !== 'Job' || !line.jobNo || !(line.totalQuantity > 0)) continue;
    if (jobNo !== undefined && line.jobNo !== jobNo) continue;
    linesByKey.set(`${line.timeSheetNo}|${line.lineNo}`, line);
  }

  const rows: ProjectTimeRow[] = [];
  for (const detail of details) {
    if (!(detail.quantity > 0)) continue;
    const line = linesByKey.get(`${detail.timeSheetNo}|${detail.timeSheetLineNo}`);
    const resourceNo = resourceNoByTimesheet.get(detail.timeSheetNo);
    if (!line?.jobNo || !resourceNo || !personResourceNos.has(resourceNo)) continue;
    // AI usage resources are a cost, never hours, even if set up as a Person
    if (isAiResource(resourceNo)) continue;
    rows.push({ jobNo: line.jobNo, resourceNo, line, detail });
  }
  return rows;
}

/** Hours by timesheet line status. approved includes time already posted. */
export interface StatusTotals {
  total: number;
  approved: number;
  submitted: number;
  unsubmitted: number;
}

/** Sum hours by line status. Rejected hours count in the total only. */
export function sumHoursByStatus(
  entries: { hours: number; status: BCTimeSheetLine['status'] }[]
): StatusTotals {
  const totals: StatusTotals = { total: 0, approved: 0, submitted: 0, unsubmitted: 0 };
  for (const { hours, status } of entries) {
    totals.total += hours;
    if (status === 'Approved') totals.approved += hours;
    else if (status === 'Submitted') totals.submitted += hours;
    else if (status === 'Open') totals.unsubmitted += hours;
  }
  return totals;
}

/**
 * Split time spent into stages, each hour counted once. Timesheet lines stay Approved
 * once posted, so the posted hours (see getPostedHours) come out of the approved hours,
 * capped at what was approved.
 */
export function toStageHours(totals: StatusTotals, postedHours: number): StageHours {
  const posted = Math.min(Math.max(postedHours, 0), totals.approved);
  return {
    posted,
    approved: totals.approved - posted,
    submitted: totals.submitted,
    unsubmitted: totals.unsubmitted,
    total: totals.total,
  };
}

/** Time spent by stage for every project with time, keyed by project number */
export function getStageHoursByProject(rows: ProjectTimeRow[]): Map<string, StageHours> {
  const postedHoursByProject = sumPostedHoursByProject(rows);
  const entriesByProject = new Map<
    string,
    { hours: number; status: BCTimeSheetLine['status'] }[]
  >();
  for (const row of rows) {
    const entries = entriesByProject.get(row.jobNo) ?? [];
    entries.push({ hours: row.detail.quantity, status: row.line.status });
    entriesByProject.set(row.jobNo, entries);
  }

  const stagesByProject = new Map<string, StageHours>();
  for (const [jobNo, entries] of entriesByProject) {
    stagesByProject.set(
      jobNo,
      toStageHours(sumHoursByStatus(entries), postedHoursByProject.get(jobNo) ?? 0)
    );
  }
  return stagesByProject;
}

/** Posted hours by project number, from the timesheets (see getPostedHours) */
export function sumPostedHoursByProject(rows: ProjectTimeRow[]): Map<string, number> {
  const posted = new Map<string, number>();
  for (const { jobNo, line, detail } of rows) {
    posted.set(jobNo, (posted.get(jobNo) ?? 0) + getPostedHours(line, detail));
  }
  return posted;
}
