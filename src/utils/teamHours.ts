/**
 * Team hours: the one calculation behind the Team page and Reports, so both show the
 * same hours, billable split, capacity and team billable target for the same period.
 *
 * Hours are the project (Job) time in each person's BC time sheet details dated in
 * the period; billable follows isBillableEntry (see billable.ts).
 */

import type { BCResource, BCTimeSheetDetail, BCTimeSheetLine, TimeEntry } from '@/types';
import { isBillableEntry, type ProjectBillTo } from './billable';
import { addStageHours, emptyStageHours, getStageHours, type StageHours } from './timesheetStatus';
import { getWeightedBillableTarget } from './billableTarget';

/** One time sheet's lines and details */
export interface TimesheetData {
  lines: BCTimeSheetLine[];
  details: BCTimeSheetDetail[];
}

/** A person's hours for a period */
export interface PersonHours {
  resource: BCResource;
  /** Weekly capacity in hours */
  capacity: number;
  /** Project time by stage; `stages.total` is all their hours */
  stages: StageHours;
  billableHours: number;
  /** One entry per time sheet detail, for breakdowns by project or day and exports */
  entries: TimeEntry[];
}

/** Dates are compared as YYYY-MM-DD strings, inclusive */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * A person's hours for a period from their time sheets: project (Job) time dated in
 * the period, split by stage and billable.
 */
export function getPersonHours(
  resource: BCResource,
  capacity: number,
  timesheets: TimesheetData[],
  projectsByNumber: ReadonlyMap<string, ProjectBillTo>,
  range: DateRange
): PersonHours {
  let stages = emptyStageHours();
  let billableHours = 0;
  const entries: TimeEntry[] = [];

  for (const { lines, details } of timesheets) {
    const inRange = details.filter(
      (d) => d.quantity > 0 && d.date >= range.from && d.date <= range.to
    );
    stages = addStageHours(stages, getStageHours(lines, inRange));

    const linesByNo = new Map(lines.map((line) => [line.lineNo, line]));
    for (const detail of inRange) {
      const line = linesByNo.get(detail.timeSheetLineNo);
      if (!line || line.type !== 'Job') continue;
      const project = line.jobNo ? projectsByNumber.get(line.jobNo) : undefined;
      const isBillable = isBillableEntry(line, project);
      if (isBillable) billableHours += detail.quantity;
      entries.push({
        id: `${line.id}_${detail.date}`,
        projectId: line.jobNo ?? '',
        taskId: line.jobTaskNo ?? '',
        userId: resource.number,
        date: detail.date,
        hours: detail.quantity,
        notes: line.description || undefined,
        isBillable,
        isRunning: false,
        createdAt: '',
        updatedAt: '',
        bcTimeSheetLineId: line.id,
        bcTimeSheetNo: line.timeSheetNo,
        bcTimeSheetLineNo: line.lineNo,
        lineStatus: line.status,
      });
    }
  }

  return { resource, capacity, stages, billableHours, entries };
}

/** What summariseHours needs about each person */
export interface PersonTotalsInput {
  capacity: number;
  stages: StageHours;
  billableHours: number;
  /** Their effective billable target, or null when targets aren't available */
  targetPercent: number | null;
}

/** Totals for a group of people (the whole team, or one person) */
export interface HoursSummary {
  totalHours: number;
  stages: StageHours;
  billableHours: number;
  nonBillableHours: number;
  capacity: number;
  /** Hours logged as a percentage of capacity */
  completion: number;
  /** Billable hours as a percentage of all hours (0 with no hours) */
  billablePercent: number;
  /**
   * Everyone's billable target weighted by their capacity; null when anyone's target
   * isn't available or there's no capacity to weight by
   */
  billableTarget: number | null;
}

/**
 * Totals for a group of people: the Team page's summary cards and Reports' figures.
 */
export function summariseHours(people: PersonTotalsInput[]): HoursSummary {
  let stages = emptyStageHours();
  let billableHours = 0;
  let capacity = 0;
  const targets: { capacity: number; targetPercent: number }[] = [];
  let targetsMissing = people.length === 0;

  for (const person of people) {
    stages = addStageHours(stages, person.stages);
    billableHours += person.billableHours;
    capacity += person.capacity;
    if (person.targetPercent === null) targetsMissing = true;
    else targets.push({ capacity: person.capacity, targetPercent: person.targetPercent });
  }

  const totalHours = stages.total;
  return {
    totalHours,
    stages,
    billableHours,
    nonBillableHours: totalHours - billableHours,
    capacity,
    completion: capacity > 0 ? (totalHours / capacity) * 100 : 0,
    billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
    billableTarget: targetsMissing ? null : getWeightedBillableTarget(targets),
  };
}
