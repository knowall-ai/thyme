import { format, subDays } from 'date-fns';
import { bcClient } from './bcClient';
import { projectService } from './projectService';
import { teamConfig } from '@/config';
import {
  buildUOMConversionMap,
  getPersonHours,
  getWeeklyCapacityHours,
  isTeamMember,
} from '@/utils';
import type { PersonHours, TimesheetData } from '@/utils';
import type { BCProject, BCTimeSheet } from '@/types';

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

  const peopleHours = await Promise.all(
    people.map(async (resource) => {
      const own = timesheetsByResource.get(resource.number) ?? [];
      const data: TimesheetData[] = await Promise.all(
        own.map(async (ts) => {
          const [lines, details] = await Promise.all([
            bcClient.getTimeSheetLines(ts.number),
            bcClient.getAllTimeSheetDetails(ts.number),
          ]);
          return { lines, details };
        })
      );
      const capacity = getWeeklyCapacityHours(resource.number, uomMap, teamConfig.defaultCapacity);
      return getPersonHours(resource, capacity, data, projectsByNumber, range);
    })
  );

  return { people: peopleHours };
}
