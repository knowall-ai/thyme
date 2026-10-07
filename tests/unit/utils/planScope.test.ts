import { describe, it, expect } from 'vitest';
import { addWeeks, format } from 'date-fns';
import {
  getPlanPreloadWindow,
  groupAllocationsByTask,
  PLAN_PRELOAD_MAX_WEEKS_AROUND,
  PLAN_PRELOAD_WEEKS_AROUND,
  type PlanJobTask,
} from '@/utils/planScope';

const ymd = (date: Date) => format(date, 'yyyy-MM-dd');
const lastWeek = (window: { start: Date; weeks: number }) =>
  ymd(addWeeks(window.start, window.weeks - 1));

describe('getPlanPreloadWindow', () => {
  // Monday 5 Oct 2026, showing 3 weeks (to the week of 19 Oct)
  const monday = new Date(2026, 9, 5);

  it('loads 12 weeks either side of the weeks on screen when the project has no dates', () => {
    const window = getPlanPreloadWindow(monday, 3);
    expect(ymd(window.start)).toBe('2026-07-13');
    expect(lastWeek(window)).toBe('2027-01-11');
    expect(window.weeks).toBe(3 + 2 * PLAN_PRELOAD_WEEKS_AROUND);
  });

  it("widens to the whole project's start-to-end range", () => {
    const window = getPlanPreloadWindow(monday, 3, '2026-01-14', '2027-06-30');
    expect(ymd(window.start)).toBe('2026-01-12');
    expect(lastWeek(window)).toBe('2027-06-28');
  });

  it('keeps 12 weeks either side for a short project', () => {
    const window = getPlanPreloadWindow(monday, 3, '2026-10-01', '2026-10-31');
    expect(ymd(window.start)).toBe('2026-07-13');
    expect(lastWeek(window)).toBe('2027-01-11');
  });

  it("caps a long project at a year either side of what's on screen", () => {
    const window = getPlanPreloadWindow(monday, 3, '2020-01-01', '2035-12-31');
    expect(ymd(window.start)).toBe(ymd(addWeeks(monday, -PLAN_PRELOAD_MAX_WEEKS_AROUND)));
    expect(lastWeek(window)).toBe(ymd(addWeeks(monday, 2 + PLAN_PRELOAD_MAX_WEEKS_AROUND)));
  });

  it("ignores BC's empty date and starts from any day's week", () => {
    const window = getPlanPreloadWindow(new Date(2026, 9, 8), 1, '0001-01-01', '');
    expect(ymd(window.start)).toBe('2026-07-13');
    expect(window.weeks).toBe(1 + 2 * PLAN_PRELOAD_WEEKS_AROUND);
  });
});

describe('groupAllocationsByTask', () => {
  const allocation = (taskNumber: string, taskName: string, resourceName = 'Alex Contoso') => ({
    taskNumber,
    taskName,
    resourceName,
  });

  const jobTasks: PlanJobTask[] = [
    { jobTaskNo: '1000', description: 'Contoso Website', jobTaskType: 'Begin-Total' },
    { jobTaskNo: '1010', description: 'Support: Block 1', jobTaskType: 'Posting' },
    { jobTaskNo: '1020', description: 'Design', jobTaskType: 'Posting' },
    { jobTaskNo: '1030', description: 'Build', jobTaskType: 'Posting' },
    { jobTaskNo: '1999', description: 'Total', jobTaskType: 'End-Total' },
  ];

  it('lists only tasks with allocations, by name, without job tasks (the Plan tab)', () => {
    const groups = groupAllocationsByTask([
      allocation('1030', 'Build'),
      allocation('1010', 'Support: Block 1'),
      allocation('1030', 'Build', 'Sam Contoso'),
    ]);
    expect(groups.map((g) => [g.taskName, g.allocations.length])).toEqual([
      ['Build', 2],
      ['Support: Block 1', 1],
    ]);
  });

  it("lists every Posting task in BC's order, even with no allocations", () => {
    const groups = groupAllocationsByTask([allocation('1030', 'Build')], jobTasks);
    expect(groups.map((g) => [g.key, g.taskName, g.allocations.length])).toEqual([
      ['1010', 'Support: Block 1', 0],
      ['1020', 'Design', 0],
      ['1030', 'Build', 1],
    ]);
  });

  it('lists a project with no allocations yet', () => {
    expect(groupAllocationsByTask([], jobTasks).map((g) => g.taskNumber)).toEqual([
      '1010',
      '1020',
      '1030',
    ]);
  });

  it("keeps allocations on tasks that aren't listed, after the listed ones", () => {
    const groups = groupAllocationsByTask(
      [allocation('', ''), allocation('1000', 'Contoso Website'), allocation('1020', 'Design')],
      jobTasks
    );
    expect(groups.map((g) => g.key)).toEqual(['1010', '1020', '1030', 'no-task', '1000']);
    expect(groups.find((g) => g.key === 'no-task')?.taskName).toBe('(No task)');
  });

  it("hides empty tasks that don't match a search", () => {
    // The allocations passed in are already narrowed to the search
    const groups = groupAllocationsByTask([allocation('1030', 'Build', 'Sam')], jobTasks, 'des');
    expect(groups.map((g) => g.taskName)).toEqual(['Design', 'Build']);
  });
});
