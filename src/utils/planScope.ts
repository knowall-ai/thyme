import { addWeeks, differenceInCalendarWeeks, max, min, startOfWeek } from 'date-fns';
import { parseBCDate } from './projectDates';

/** Weeks either side of the weeks on screen that a project's Plan dialog always preloads */
export const PLAN_PRELOAD_WEEKS_AROUND = 12;

/** Furthest a long-running project's preload reaches from the weeks on screen, either way */
export const PLAN_PRELOAD_MAX_WEEKS_AROUND = 52;

export interface PlanPreloadWindow {
  /** Monday of the first preloaded week */
  start: Date;
  /** Number of weeks preloaded from `start` */
  weeks: number;
}

/**
 * The weeks a project's Plan dialog loads up front, so moving between weeks needs no fetch:
 * the weeks on screen plus 12 either side, widened to the project's whole start-to-end range,
 * but never more than a year either side of the weeks on screen.
 *
 * Business Central returns a project's planning lines for all dates in one request, so a
 * wider window costs no extra calls; the cap only bounds the per-week bookkeeping. Moving
 * past the window loads the next one the same way.
 */
export function getPlanPreloadWindow(
  visibleStart: Date,
  visibleWeeks: number,
  projectStartDate?: string,
  projectEndDate?: string
): PlanPreloadWindow {
  const week = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });
  const firstVisible = week(visibleStart);
  const lastVisible = addWeeks(firstVisible, Math.max(visibleWeeks, 1) - 1);

  const projectStart = parseBCDate(projectStartDate);
  const projectEnd = parseBCDate(projectEndDate);

  const start = max([
    min([
      addWeeks(firstVisible, -PLAN_PRELOAD_WEEKS_AROUND),
      ...(projectStart ? [week(projectStart)] : []),
    ]),
    addWeeks(firstVisible, -PLAN_PRELOAD_MAX_WEEKS_AROUND),
  ]);
  const end = min([
    max([
      addWeeks(lastVisible, PLAN_PRELOAD_WEEKS_AROUND),
      ...(projectEnd ? [week(projectEnd)] : []),
    ]),
    addWeeks(lastVisible, PLAN_PRELOAD_MAX_WEEKS_AROUND),
  ]);

  return {
    start,
    weeks: differenceInCalendarWeeks(end, start, { weekStartsOn: 1 }) + 1,
  };
}

/** The job task fields needed to list a project's tasks */
export interface PlanJobTask {
  jobTaskNo: string;
  description: string;
  jobTaskType?: string;
}

export interface PlanTaskGroup<T> {
  /** Stable key for expand state: the task number, or "no-task" */
  key: string;
  taskNumber: string;
  taskName: string;
  allocations: T[];
}

/**
 * Group a project's allocations by task.
 *
 * Without `jobTasks` (the Plan tab), only tasks with allocations are listed, by name.
 * With `jobTasks` (a project's Plan dialog), every Posting task is listed in Business
 * Central's order, even with no allocations, so any task can be planned; allocations on
 * a task that isn't listed follow by name. While searching (`query`), a task with no
 * matching allocations is only listed if its name or number matches.
 */
export function groupAllocationsByTask<T extends { taskNumber?: string; taskName?: string }>(
  allocations: T[],
  jobTasks?: PlanJobTask[],
  query = ''
): PlanTaskGroup<T>[] {
  const groups = new Map<string, PlanTaskGroup<T>>();
  for (const allocation of allocations) {
    const key = allocation.taskNumber || 'no-task';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        taskNumber: allocation.taskNumber || '',
        taskName: allocation.taskName || '(No task)',
        allocations: [],
      };
      groups.set(key, group);
    }
    group.allocations.push(allocation);
  }

  const byName = (a: PlanTaskGroup<T>, b: PlanTaskGroup<T>) => a.taskName.localeCompare(b.taskName);
  if (!jobTasks) return Array.from(groups.values()).sort(byName);

  const search = query.trim().toLowerCase();
  const listed: PlanTaskGroup<T>[] = [];
  for (const task of jobTasks) {
    if (task.jobTaskType !== 'Posting' || !task.jobTaskNo) continue;
    const group = groups.get(task.jobTaskNo);
    groups.delete(task.jobTaskNo);
    const taskName = task.description || task.jobTaskNo;
    if (
      !group &&
      search &&
      !taskName.toLowerCase().includes(search) &&
      !task.jobTaskNo.toLowerCase().includes(search)
    ) {
      continue;
    }
    listed.push({
      key: task.jobTaskNo,
      taskNumber: task.jobTaskNo,
      taskName,
      allocations: group?.allocations ?? [],
    });
  }
  return [...listed, ...Array.from(groups.values()).sort(byName)];
}
