import { format, subDays } from 'date-fns';
import { bcClient } from './bcClient';
import { projectService } from './projectService';
import { teamConfig } from '@/config';
import {
  buildUOMConversionMap,
  getPersonHours,
  isTeamMember,
  resolveWeeklyCapacity,
} from '@/utils';
import type { PersonHours, TimesheetData } from '@/utils';
import type { BCProject, BCTimeSheet } from '@/types';

// Time sheets loaded at once (two requests each): BC throttles beyond a handful of
// concurrent requests per user
const MAX_PARALLEL_TIMESHEETS = 3;

/** Run `task` on every item, at most `limit` at a time; rejects on the first failure */
async function inParallel<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    while (queue.length > 0) await task(queue.shift()!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

export interface TeamHours {
  /** The people on the team (isTeamMember), with their hours for the period */
  people: PersonHours[];
}

/**
 * The team's hours for a period: who's on the team, their capacity and their project
 * time in BC time sheets dated from `from` to `to` (inclusive). The Team page and
 * Reports both load through here, so they always agree.
 *
 * Time sheets are matched to people by resource number, never by time sheet owner:
 * one user can own several resources' time sheets (e.g. AI agents' time sheets owned
 * by a colleague), and each resource must count only its own time.
 */
export async function loadTeamHours(from: Date, to: Date): Promise<TeamHours> {
  // Local calendar dates: BC compares plain dates
  const range = { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
  // A weekly time sheet starting up to 6 days earlier can still hold time in the period
  const earliestStart = format(subDays(from, 6), 'yyyy-MM-dd');

  const [resources, uoms, projectsByNumber, timesheets] = await Promise.all([
    bcClient.getResources(),
    bcClient.getResourceUnitsOfMeasure(),
    // Projects' bill-to customers decide which time is billable
    projectService.getProjectsByNumber().catch(() => new Map<string, BCProject>()),
    bcClient.getTimeSheetsStartingBetween(earliestStart, range.to),
  ]);
  // The people who can log time: leaves out placeholder role resources, blocked
  // resources and empty resource cards
  const people = resources.filter(isTeamMember);
  const uomMap = buildUOMConversionMap(uoms);

  const timesheetsByResource = new Map<string, BCTimeSheet[]>();
  for (const ts of timesheets) {
    timesheetsByResource.set(ts.resourceNo, [
      ...(timesheetsByResource.get(ts.resourceNo) ?? []),
      ts,
    ]);
  }

  // Each time sheet's lines and details, a few time sheets at a time so BC doesn't
  // throttle a big team's month. Any failure fails the load rather than hiding hours.
  const ownSheets = timesheets.filter((ts) => people.some((p) => p.number === ts.resourceNo));
  const sheetData = new Map<string, TimesheetData>();
  await inParallel(ownSheets, MAX_PARALLEL_TIMESHEETS, async (ts) => {
    const [lines, details] = await Promise.all([
      bcClient.getTimeSheetLines(ts.number),
      bcClient.getAllTimeSheetDetails(ts.number),
    ]);
    sheetData.set(ts.number, { lines, details });
  });

  const peopleHours = people.map((resource) => {
    const data = (timesheetsByResource.get(resource.number) ?? []).flatMap(
      (ts) => sheetData.get(ts.number) ?? []
    );
    // Their own weekly capacity (Thyme BC Extension 1.17+), else hours per day x 5
    const weekly = resolveWeeklyCapacity(resource, uomMap, teamConfig.defaultCapacity);
    return { ...getPersonHours(resource, weekly.hours, data, projectsByNumber, range), weekly };
  });

  return { people: peopleHours };
}
