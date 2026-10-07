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
