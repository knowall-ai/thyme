import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addWeeks, format, startOfWeek } from 'date-fns';

const getJobPlanningLines = vi.fn();

vi.mock('@/services/bc', () => ({
  ExtensionNotInstalledError: class ExtensionNotInstalledError extends Error {},
  bcClient: {
    getResources: vi.fn(async () => [{ id: 'r1', number: 'RES01', name: 'Alex Contoso' }]),
    getProjects: vi.fn(async () => [
      { id: 'p1', number: 'PR001', displayName: 'Contoso Website', billToCustomerName: '' },
    ]),
    getJobTasks: vi.fn(async () => []),
    getJobPlanningLines: (...args: unknown[]) => getJobPlanningLines(...args),
    getResourceUnitsOfMeasure: vi.fn(async () => []),
    getTimeSheets: vi.fn(async () => []),
  },
}));

import { usePlanStore } from '@/hooks/usePlanStore';

const line = (planningDate: string) => ({
  id: planningDate,
  jobNo: 'PR001',
  jobTaskNo: '100',
  lineNo: 1,
  planningDate,
  lineType: 'Budget',
  type: 'Resource',
  number: 'RES01',
  quantity: 8,
});

describe('usePlanStore.fetchTeamData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanStore.setState({ cache: null, allAllocations: [] });
  });

  it('ignores an older load that finishes after a newer one', async () => {
    // e.g. the Planned dialog still loading when the Plan tab opens on another week
    const weekA = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekB = addWeeks(weekA, 10);
    const dayA = format(weekA, 'yyyy-MM-dd');
    const dayB = format(weekB, 'yyyy-MM-dd');

    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    getJobPlanningLines.mockImplementationOnce(async () => {
      await slow;
      return [line(dayA)];
    });
    getJobPlanningLines.mockResolvedValueOnce([line(dayB)]);

    const older = usePlanStore.getState().fetchTeamData(weekA, 1);
    const newer = usePlanStore.getState().fetchTeamData(weekB, 1);
    await newer;
    releaseSlow();
    await older;

    expect(usePlanStore.getState().allAllocations.map((a) => a.startDate)).toEqual([dayB]);
  });

  it.each([
    ['an invalid week', new Date(NaN), 1],
    ['zero weeks', new Date(), 0],
    ['a fractional week count', new Date(), 1.5],
    ['too many weeks', new Date(), 53],
  ])('ignores %s without superseding a load in flight', async (_label, weekStart, weeks) => {
    const week = startOfWeek(new Date(), { weekStartsOn: 1 });
    const day = format(week, 'yyyy-MM-dd');
    getJobPlanningLines.mockResolvedValue([line(day)]);

    const valid = usePlanStore.getState().fetchTeamData(week, 1);
    await usePlanStore.getState().fetchTeamData(weekStart as Date, weeks as number);
    await valid;

    expect(usePlanStore.getState().allAllocations.map((a) => a.startDate)).toEqual([day]);
    expect(getJobPlanningLines).toHaveBeenCalledTimes(1);
  });
});

describe("usePlanStore.fetchTeamData for a project's dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlanStore.setState({ cache: null, allAllocations: [] });
  });

  it('preloads the weeks around the project so moving week needs no fetch', async () => {
    const { bcClient } = await import('@/services/bc');
    const week = startOfWeek(new Date(), { weekStartsOn: 1 });
    const later = addWeeks(week, 8);
    getJobPlanningLines.mockResolvedValue([line(format(later, 'yyyy-MM-dd'))]);

    await usePlanStore.getState().fetchTeamData(week, 3, undefined, { projectCode: 'PR001' });
    expect(usePlanStore.getState().allAllocations).toEqual([]);

    await usePlanStore.getState().fetchTeamData(later, 3, undefined, { projectCode: 'PR001' });

    expect(usePlanStore.getState().allAllocations.map((a) => a.startDate)).toEqual([
      format(later, 'yyyy-MM-dd'),
    ]);
    expect(getJobPlanningLines).toHaveBeenCalledTimes(1);
    expect(bcClient.getJobTasks).toHaveBeenCalledTimes(1);
    // Team timesheets are only shown on the Plan tab's Team view
    expect(bcClient.getTimeSheets).not.toHaveBeenCalled();
  });

  it("exposes each project's job tasks", async () => {
    const { bcClient } = await import('@/services/bc');
    const tasks = [
      { id: 't1', jobNo: 'PR001', jobTaskNo: '100', description: 'Build', jobTaskType: 'Posting' },
    ];
    vi.mocked(bcClient.getJobTasks).mockResolvedValueOnce(tasks as never);
    getJobPlanningLines.mockResolvedValue([]);

    const week = startOfWeek(new Date(), { weekStartsOn: 1 });
    await usePlanStore.getState().fetchTeamData(week, 3, undefined, { projectCode: 'PR001' });

    expect(usePlanStore.getState().jobTasksByProject.get('PR001')).toEqual(tasks);
  });

  it("retries the project's tasks when an earlier load got none", async () => {
    const { bcClient } = await import('@/services/bc');
    const tasks = [
      { id: 't1', jobNo: 'PR001', jobTaskNo: '100', description: 'Build', jobTaskType: 'Posting' },
    ];
    getJobPlanningLines.mockResolvedValue([]);
    const week = startOfWeek(new Date(), { weekStartsOn: 1 });

    // e.g. a transient failure (getJobTasks returns [] rather than throwing)
    await usePlanStore.getState().fetchTeamData(week, 3);
    vi.mocked(bcClient.getJobTasks).mockResolvedValueOnce(tasks as never);
    await usePlanStore
      .getState()
      .fetchTeamData(addWeeks(week, 8), 3, undefined, { projectCode: 'PR001' });

    expect(usePlanStore.getState().jobTasksByProject.get('PR001')).toEqual(tasks);
  });

  it('still loads only the weeks on screen for the Plan tab', async () => {
    const week = startOfWeek(new Date(), { weekStartsOn: 1 });
    getJobPlanningLines.mockResolvedValue([]);

    await usePlanStore.getState().fetchTeamData(week, 3);
    await usePlanStore.getState().fetchTeamData(addWeeks(week, 8), 3);

    expect(getJobPlanningLines).toHaveBeenCalledTimes(2);
  });
});
