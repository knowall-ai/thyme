import { describe, it, expect, vi, beforeEach } from 'vitest';

const getResources = vi.fn();
const getResourceUnitsOfMeasure = vi.fn();
const getTimeSheetsStartingBetween = vi.fn();
const getTimeSheetLinesStartingBetween = vi.fn();
const getTimeSheetDetailsBetween = vi.fn();
const getProjectsByNumber = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getResources: (...args: unknown[]) => getResources(...args),
    getResourceUnitsOfMeasure: (...args: unknown[]) => getResourceUnitsOfMeasure(...args),
    getTimeSheetsStartingBetween: (...args: unknown[]) => getTimeSheetsStartingBetween(...args),
    getTimeSheetLinesStartingBetween: (...args: unknown[]) =>
      getTimeSheetLinesStartingBetween(...args),
    getTimeSheetDetailsBetween: (...args: unknown[]) => getTimeSheetDetailsBetween(...args),
  },
}));
vi.mock('@/services/bc/projectService', () => ({
  projectService: { getProjectsByNumber: () => getProjectsByNumber() },
}));

import { loadTeamHours } from '@/services/bc/teamHoursService';
import { isCounted, summariseHours } from '@/utils';

const person = (number: string, name: string, owner: string) => ({
  id: `id-${number}`,
  number,
  name,
  type: 'Person',
  useTimeSheet: true,
  blocked: false,
  timeSheetOwnerUserId: owner,
});

describe('loadTeamHours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResourceUnitsOfMeasure.mockResolvedValue([]);
    getProjectsByNumber.mockResolvedValue(
      new Map([['PR-CONTOSO', { billToCustomerNo: 'C10000', billToCustomerName: 'Contoso Ltd.' }]])
    );
  });

  it("counts each resource's own time sheet once, even when one user owns several", async () => {
    // A colleague owns her own time sheet and two helper resources' time sheets
    getResources.mockResolvedValue([
      person('R1', 'Alex Contoso', 'ALEX.CONTOSO'),
      person('R2', 'Sam Contoso', 'SAM.CONTOSO'),
      person('R3', 'Helper One', 'SAM.CONTOSO'),
      person('R4', 'Helper Two', 'SAM.CONTOSO'),
      { ...person('R5', 'Design Resource', ''), timeSheetOwnerUserId: '' },
    ]);
    getTimeSheetsStartingBetween.mockResolvedValue([
      { number: 'TS-A', resourceNo: 'R1', startingDate: '2026-10-05' },
      { number: 'TS-S', resourceNo: 'R2', startingDate: '2026-10-05' },
    ]);
    const lineFor = (ts: string) => [
      {
        id: `${ts}-l1`,
        timeSheetNo: ts,
        lineNo: 10000,
        type: 'Job',
        jobNo: 'PR-CONTOSO',
        jobTaskNo: '1000',
        status: 'Open',
      },
    ];
    getTimeSheetLinesStartingBetween.mockResolvedValue([
      ...lineFor('TS-A'),
      ...lineFor('TS-S'),
      // A time sheet the user can't see (not returned by getTimeSheetsStartingBetween)
      ...lineFor('TS-HIDDEN'),
    ]);
    getTimeSheetDetailsBetween.mockResolvedValue(
      [
        ['TS-A', 9.75],
        ['TS-S', 6],
        ['TS-HIDDEN', 8],
      ].map(([ts, quantity]) => ({
        timeSheetNo: ts,
        timeSheetLineNo: 10000,
        date: '2026-10-06',
        quantity,
      }))
    );

    const { people } = await loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11));

    expect(people.map((p) => p.resource.number)).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(people.map((p) => p.stages.total)).toEqual([9.75, 6, 0, 0]);
    expect(summariseHours(people.map((p) => ({ ...p, targetPercent: null }))).totalHours).toBe(
      15.75
    );
    // One request for everyone's time sheets, from 6 days before the period
    expect(getTimeSheetsStartingBetween).toHaveBeenCalledWith('2026-09-29', '2026-10-11');
    // Lines and details in one query each, however many time sheets
    expect(getTimeSheetLinesStartingBetween).toHaveBeenCalledWith('2026-09-29', '2026-10-11');
    expect(getTimeSheetDetailsBetween).toHaveBeenCalledWith('2026-10-05', '2026-10-11');
  });

  it('fails rather than hide hours, but carries on without projects', async () => {
    getResources.mockResolvedValue([person('R1', 'Alex Contoso', 'ALEX.CONTOSO')]);
    getTimeSheetsStartingBetween.mockResolvedValue([{ number: 'TS-A', resourceNo: 'R1' }]);
    getTimeSheetLinesStartingBetween.mockResolvedValue([
      { id: 'l1', timeSheetNo: 'TS-A', lineNo: 1, type: 'Job', jobNo: 'PR-INTERNAL' },
    ]);
    getTimeSheetDetailsBetween.mockResolvedValue([
      { timeSheetNo: 'TS-A', timeSheetLineNo: 1, date: '2026-10-06', quantity: 4 },
    ]);

    // Without projects, time can't be judged internal: flagged so the page can say so
    getProjectsByNumber.mockRejectedValueOnce(new Error('BC API Error (500)'));
    const withoutProjects = await loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11));
    expect(withoutProjects.projectsUnavailable).toBe(true);
    expect(withoutProjects.people[0].billableHours).toBe(4);

    getTimeSheetDetailsBetween.mockRejectedValueOnce(new Error('BC API Error (429)'));
    await expect(loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11))).rejects.toThrow('429');
  });
});

describe('loadTeamHours weekly capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResourceUnitsOfMeasure.mockResolvedValue([
      { resourceNo: 'R1', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
      { resourceNo: 'R2', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
      { resourceNo: 'R3', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
    ]);
    getProjectsByNumber.mockResolvedValue(new Map());
    getTimeSheetsStartingBetween.mockResolvedValue([]);
    getTimeSheetLinesStartingBetween.mockResolvedValue([]);
    getTimeSheetDetailsBetween.mockResolvedValue([]);
  });

  it("uses each person's own weekly capacity, and 0 means listed but not counted", async () => {
    getResources.mockResolvedValue([
      person('R1', 'Alex Contoso', 'ALEX.CONTOSO'),
      {
        ...person('R2', 'Sam Contoso', 'SAM.CONTOSO'),
        weeklyCapacitySet: true,
        weeklyCapacityHours: 15,
        flexibleWorkingDays: true,
      },
      {
        ...person('R3', 'Contoso Agent', 'SAM.CONTOSO'),
        weeklyCapacitySet: true,
        weeklyCapacityHours: 0,
      },
    ]);

    const { people } = await loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11));

    expect(people.map((p) => p.capacity)).toEqual([37.5, 15, 0]);
    expect(people[1].weekly).toMatchObject({ flexible: true, isSet: true });
    expect(people.map(isCounted)).toEqual([true, true, false]);
    expect(
      summariseHours(people.filter(isCounted).map((p) => ({ ...p, targetPercent: null }))).capacity
    ).toBe(52.5);
  });
});
