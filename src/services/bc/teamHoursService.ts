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

export interface TeamHours {
  /** The people on the team (isTeamMember), with their hours for the period */
  people: PersonHours[];
  /**
   * Projects couldn't be loaded, so internal projects' time couldn't be told apart and
   * counts as billable unless its line is marked not chargeable
   */
  projectsUnavailable: boolean;
  /**
   * The projects loaded to decide billable time, by project number (empty when they
   * couldn't be loaded): their names and bill-to customers, e.g. for Reports' filters
   */
  projectsByNumber: ReadonlyMap<string, BCProject>;
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

  // Lines and details come in one paged query each, by date, rather than two requests
  // per time sheet: a year for a whole team is then a handful of requests, not thousands
  const [resources, uoms, projectsByNumber, timesheets, allLines, allDetails] = await Promise.all([
    bcClient.getResources(),
    bcClient.getResourceUnitsOfMeasure(),
    // Projects' bill-to customers decide which time is billable
    projectService.getProjectsByNumber().catch(() => null),
    bcClient.getTimeSheetsStartingBetween(earliestStart, range.to),
    bcClient.getTimeSheetLinesStartingBetween(earliestStart, range.to),
    bcClient.getTimeSheetDetailsBetween(range.from, range.to),
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

  // Each time sheet's lines and details. Only time sheets the user can see (those
  // getTimeSheetsStartingBetween returned) are kept.
  const sheetData = new Map<string, TimesheetData>(
    timesheets.map((ts) => [ts.number, { lines: [], details: [] }])
  );
  for (const line of allLines) sheetData.get(line.timeSheetNo)?.lines.push(line);
  for (const detail of allDetails) sheetData.get(detail.timeSheetNo)?.details.push(detail);

  const peopleHours = people.map((resource) => {
    const data = (timesheetsByResource.get(resource.number) ?? []).flatMap(
      (ts) => sheetData.get(ts.number) ?? []
    );
    // Their own weekly capacity (Thyme BC Extension 1.19+), else hours per day x 5
    const weekly = resolveWeeklyCapacity(resource, uomMap, teamConfig.defaultCapacity);
    return {
      ...getPersonHours(resource, weekly.hours, data, projectsByNumber ?? new Map(), range),
      weekly,
    };
  });

  return {
    people: peopleHours,
    projectsUnavailable: projectsByNumber === null,
    projectsByNumber: projectsByNumber ?? new Map(),
  };
}
