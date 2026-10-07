import { describe, it, expect, vi, beforeEach } from 'vitest';

const getResources = vi.fn();
const getResourceUnitsOfMeasure = vi.fn();
const getTimeSheetsStartingBetween = vi.fn();
const getTimeSheetLines = vi.fn();
const getAllTimeSheetDetails = vi.fn();
const getProjectsByNumber = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    getResources: (...args: unknown[]) => getResources(...args),
    getResourceUnitsOfMeasure: (...args: unknown[]) => getResourceUnitsOfMeasure(...args),
    getTimeSheetsStartingBetween: (...args: unknown[]) => getTimeSheetsStartingBetween(...args),
    getTimeSheetLines: (...args: unknown[]) => getTimeSheetLines(...args),
    getAllTimeSheetDetails: (...args: unknown[]) => getAllTimeSheetDetails(...args),
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
    getTimeSheetLines.mockImplementation(async (ts: string) => lineFor(ts));
    getAllTimeSheetDetails.mockImplementation(async (ts: string) => [
      {
        timeSheetNo: ts,
        timeSheetLineNo: 10000,
        date: '2026-10-06',
        quantity: ts === 'TS-A' ? 9.75 : 6,
      },
    ]);

    const { people } = await loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11));

    expect(people.map((p) => p.resource.number)).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(people.map((p) => p.stages.total)).toEqual([9.75, 6, 0, 0]);
    expect(summariseHours(people.map((p) => ({ ...p, targetPercent: null }))).totalHours).toBe(
      15.75
    );
    // One request for everyone's time sheets, from 6 days before the period
    expect(getTimeSheetsStartingBetween).toHaveBeenCalledWith('2026-09-29', '2026-10-11');
    expect(getTimeSheetLines).toHaveBeenCalledTimes(2);
  });

  it('loads a big team a few time sheets at a time, and fails rather than hide hours', async () => {
    const people = Array.from({ length: 10 }, (_, i) =>
      person(`R${i}`, `Person ${i} Contoso`, `PERSON${i}.CONTOSO`)
    );
    getResources.mockResolvedValue(people);
    getTimeSheetsStartingBetween.mockResolvedValue(
      people.map((p) => ({ number: `TS-${p.number}`, resourceNo: p.number }))
    );
    let inFlight = 0;
    let maxInFlight = 0;
    getTimeSheetLines.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return [];
    });
    getAllTimeSheetDetails.mockResolvedValue([]);

    const { people: loaded } = await loadTeamHours(new Date(2026, 9, 5), new Date(2026, 9, 11));
    expect(loaded).toHaveLength(10);
    expect(getTimeSheetLines).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);

    getAllTimeSheetDetails.mockRejectedValueOnce(new Error('BC API Error (429)'));
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
