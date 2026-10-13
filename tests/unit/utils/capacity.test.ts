import { describe, it, expect } from 'vitest';
import {
  DAILY_CAPACITY_HOURS,
  buildResourceDailyTotals,
  getOverAllocationHours,
  getOverAllocatedResources,
  getOverAllocationTitle,
  getWeekToDateHours,
  getWeekHours,
  formatOverAllocation,
  getUnderAllocationHours,
  getUnderAllocatedResources,
  getUnderAllocationTitle,
  getCapacityFlag,
  type DailyResourceAllocation,
} from '@/utils/capacity';

const DAY = '2026-10-05';

function alloc(partial: Partial<DailyResourceAllocation>): DailyResourceAllocation {
  return {
    resourceNumber: 'R001',
    resourceName: 'Alex Contoso',
    projectNumber: 'PR001',
    projectName: 'Contoso Website',
    startDate: DAY,
    hoursPerDay: 8,
    ...partial,
  };
}

describe('getOverAllocationHours', () => {
  it('returns 0 at or under capacity', () => {
    expect(getOverAllocationHours(0)).toBe(0);
    expect(getOverAllocationHours(DAILY_CAPACITY_HOURS)).toBe(0);
  });

  it('returns the excess over capacity', () => {
    expect(getOverAllocationHours(25.5)).toBe(17.5);
    expect(getOverAllocationHours(10, 7.5)).toBe(2.5);
  });

  it('ignores floating-point noise', () => {
    expect(getOverAllocationHours(0.1 + 0.2 + 7.7)).toBe(0);
  });
});

describe('buildResourceDailyTotals', () => {
  it('skips non-finite and negative hours', () => {
    const totals = buildResourceDailyTotals([
      alloc({ hoursPerDay: 6 }),
      alloc({ hoursPerDay: NaN }),
      alloc({ hoursPerDay: Infinity }),
      alloc({ hoursPerDay: -3 }),
      alloc({ hoursPerDay: 1.5 }),
    ]);
    expect(totals.get(`R001|${DAY}`)?.hours).toBe(7.5);
  });

  it('splits the day by project', () => {
    const totals = buildResourceDailyTotals([
      alloc({ hoursPerDay: 4 }),
      alloc({ hoursPerDay: 2 }),
      alloc({ projectNumber: 'PR002', projectName: 'Contoso App', hoursPerDay: 3 }),
    ]);
    const byProject = totals.get(`R001|${DAY}`)?.byProject;
    expect(byProject?.get('PR001')?.hours).toBe(6);
    expect(byProject?.get('PR002')).toEqual({
      projectNumber: 'PR002',
      projectName: 'Contoso App',
      hours: 3,
    });
  });
});

describe('getOverAllocatedResources', () => {
  it('sums a resource across projects before comparing to capacity', () => {
    const projectA = alloc({ hoursPerDay: 24 });
    const projectB = alloc({
      projectNumber: 'PR002',
      projectName: 'Contoso App',
      hoursPerDay: 1.5,
    });
    const totals = buildResourceDailyTotals([projectA, projectB]);

    // Only project A's allocation is in this cell, but the total spans both projects
    expect(getOverAllocatedResources([projectA], totals, DAY)).toEqual([
      {
        resourceNumber: 'R001',
        resourceName: 'Alex Contoso',
        allocatedHours: 25.5,
        capacityHours: 8,
        overByHours: 17.5,
        projects: [
          { projectNumber: 'PR001', projectName: 'Contoso Website', hours: 24 },
          { projectNumber: 'PR002', projectName: 'Contoso App', hours: 1.5 },
        ],
      },
    ]);
  });

  it('flags a cell that is within capacity on its own when the day total is over', () => {
    const projectA = alloc({ hoursPerDay: 5 });
    const projectB = alloc({ projectNumber: 'PR002', hoursPerDay: 5 });
    const totals = buildResourceDailyTotals([projectA, projectB]);

    expect(getOverAllocatedResources([projectA], totals, DAY)).toHaveLength(1);
  });

  it("uses each person's own daily capacity", () => {
    const allocations = [
      alloc({ hoursPerDay: 7.75 }),
      alloc({ resourceNumber: 'R002', resourceName: 'Sam Contoso', hoursPerDay: 7.75 }),
    ];
    const totals = buildResourceDailyTotals(allocations);
    const capacity = (resourceNumber: string) => (resourceNumber === 'R001' ? 7.5 : 8);

    const over = getOverAllocatedResources(allocations, totals, DAY, capacity);
    expect(over.map((o) => [o.resourceNumber, o.capacityHours, o.overByHours])).toEqual([
      ['R001', 7.5, 0.25],
    ]);
  });

  it('does not flag resources within capacity or on other days', () => {
    const allocations = [
      alloc({ hoursPerDay: 8 }),
      alloc({
        resourceNumber: 'R002',
        resourceName: 'Other',
        hoursPerDay: 12,
        startDate: '2026-10-06',
      }),
    ];
    const totals = buildResourceDailyTotals(allocations);

    expect(getOverAllocatedResources(allocations, totals, DAY)).toEqual([]);
  });

  it('lists each over-allocated resource once', () => {
    const allocations = [
      alloc({ hoursPerDay: 6 }),
      alloc({ hoursPerDay: 6 }),
      alloc({ resourceNumber: 'R002', resourceName: 'Sam Contoso', hoursPerDay: 9 }),
    ];
    const totals = buildResourceDailyTotals(allocations);

    expect(
      getOverAllocatedResources(allocations, totals, DAY).map((o) => o.resourceNumber)
    ).toEqual(['R001', 'R002']);
  });
});

describe('getOverAllocationTitle', () => {
  it('returns undefined when within capacity', () => {
    const allocations = [alloc({ hoursPerDay: 8 })];
    expect(
      getOverAllocationTitle(allocations, buildResourceDailyTotals(allocations), DAY)
    ).toBeUndefined();
  });

  it('explains the over-allocation across projects, with a per-project breakdown', () => {
    const allocations = [
      alloc({ hoursPerDay: 16 }),
      alloc({ projectNumber: 'PR002', projectName: 'Contoso App', hoursPerDay: 7.5 }),
      alloc({ projectNumber: 'PR003', projectName: 'Contoso Support', hoursPerDay: 5.25 }),
    ];
    expect(
      getOverAllocationTitle(
        allocations.slice(0, 1),
        buildResourceDailyTotals(allocations),
        DAY,
        false,
        () => 7.5
      )
    ).toBe(
      [
        'Over-allocated: 28.75h planned across 3 projects (capacity 7.5h)',
        '  Contoso Website: 16h',
        '  Contoso App: 7.5h',
        '  Contoso Support: 5.25h',
      ].join('\n')
    );
  });

  it('says "1 project" and defaults capacity to 8h', () => {
    const allocations = [alloc({ hoursPerDay: 9 })];
    expect(getOverAllocationTitle(allocations, buildResourceDailyTotals(allocations), DAY)).toBe(
      'Over-allocated: 9h planned across 1 project (capacity 8h)\n  Contoso Website: 9h'
    );
  });

  it('names each person for rolled-up rows', () => {
    const allocations = [
      alloc({ hoursPerDay: 10 }),
      alloc({ resourceNumber: 'R002', resourceName: 'Sam Contoso', hoursPerDay: 9 }),
    ];
    expect(
      getOverAllocationTitle(allocations, buildResourceDailyTotals(allocations), DAY, true)
    ).toBe(
      [
        'Alex Contoso over-allocated: 10h planned across 1 project (capacity 8h)',
        '  Contoso Website: 10h',
        'Sam Contoso over-allocated: 9h planned across 1 project (capacity 8h)',
        '  Contoso Website: 9h',
      ].join('\n')
    );
  });
});

describe('weekly capacity', () => {
  // Mon 5 Oct to Wed 7 Oct 2026, 7.5h each, for someone on 15h a week
  const week = ['2026-10-05', '2026-10-06', '2026-10-07'].map((startDate) =>
    alloc({ startDate, hoursPerDay: 7.5 })
  );
  const totals = buildResourceDailyTotals(week);
  const daily = () => 7.5;

  it('sums the week from Monday up to the day', () => {
    expect(getWeekToDateHours(totals, 'R001', '2026-10-05')).toBe(7.5);
    expect(getWeekToDateHours(totals, 'R001', '2026-10-07')).toBe(22.5);
    // Sunday belongs to the same week; the next Monday starts again
    expect(getWeekToDateHours(totals, 'R001', '2026-10-11')).toBe(22.5);
    expect(getWeekToDateHours(totals, 'R001', '2026-10-12')).toBe(0);
  });

  it('allows full days until the week goes over its capacity', () => {
    const weekly = () => 15;
    expect(getOverAllocatedResources(week, totals, '2026-10-05', daily, weekly)).toEqual([]);
    expect(getOverAllocatedResources(week, totals, '2026-10-06', daily, weekly)).toEqual([]);
    const [over] = getOverAllocatedResources(week, totals, '2026-10-07', daily, weekly);
    expect(over).toMatchObject({
      overByHours: 0,
      weekPlannedHours: 22.5,
      weekCapacityHours: 15,
      weekOverByHours: 7.5,
    });
    expect(formatOverAllocation(over)).toBe(
      'Over weekly capacity: 22.5h planned this week so far (capacity 15h a week)\n  Contoso Website: 7.5h'
    );
  });

  it('still flags a single day over a full day', () => {
    const allocations = [alloc({ hoursPerDay: 9 })];
    const [over] = getOverAllocatedResources(
      allocations,
      buildResourceDailyTotals(allocations),
      DAY,
      daily,
      () => 15
    );
    expect(over.overByHours).toBe(1.5);
    expect(over.weekOverByHours).toBeUndefined();
  });

  it('has no weekly cap without a weekly capacity (unchanged behaviour)', () => {
    expect(getOverAllocatedResources(week, totals, '2026-10-07', daily, () => null)).toEqual([]);
    expect(getOverAllocatedResources(week, totals, '2026-10-07', daily)).toEqual([]);
  });

  it('never flags someone who is not counted (weekly capacity 0)', () => {
    const allocations = [alloc({ hoursPerDay: 12 })];
    expect(
      getOverAllocatedResources(
        allocations,
        buildResourceDailyTotals(allocations),
        DAY,
        daily,
        () => 0
      )
    ).toEqual([]);
  });

  it('names the person and both reasons in the tooltip', () => {
    const allocations = [...week, alloc({ startDate: '2026-10-07', hoursPerDay: 2 })];
    const title = getOverAllocationTitle(
      allocations,
      buildResourceDailyTotals(allocations),
      '2026-10-07',
      true,
      daily,
      () => 15
    );
    expect(title).toContain('Alex Contoso over-allocated: 9.5h planned');
    expect(title).toContain('Alex Contoso over weekly capacity: 24.5h planned this week so far');
  });
});

describe('getUnderAllocationHours', () => {
  it('returns the shortfall under capacity', () => {
    expect(getUnderAllocationHours(5.5)).toBe(2.5);
    expect(getUnderAllocationHours(6, 7.5)).toBe(1.5);
  });

  it('returns 0 at or over capacity', () => {
    expect(getUnderAllocationHours(DAILY_CAPACITY_HOURS)).toBe(0);
    expect(getUnderAllocationHours(9)).toBe(0);
  });

  it('ignores floating-point noise', () => {
    expect(getUnderAllocationHours(7.4999999, 7.5)).toBe(0);
  });
});

describe('under capacity', () => {
  const underOn = (allocations: DailyResourceAllocation[], date = DAY, weekly?: number | null) =>
    getUnderAllocatedResources(
      allocations,
      buildResourceDailyTotals(allocations),
      date,
      () => 7.5,
      weekly === undefined ? undefined : () => weekly
    );

  it('flags a weekday with some hours planned but under a working day', () => {
    const allocations = [
      alloc({ hoursPerDay: 4 }),
      alloc({ projectNumber: 'PR002', projectName: 'Contoso App', hoursPerDay: 1.5 }),
    ];
    const [under] = underOn(allocations);
    expect(under).toMatchObject({
      plannedHours: 5.5,
      capacityHours: 7.5,
      underByHours: 2,
      weekly: false,
    });
    expect(
      getUnderAllocationTitle(
        allocations,
        buildResourceDailyTotals(allocations),
        DAY,
        false,
        () => 8
      )
    ).toBe(
      'Under capacity: 5.5h planned (capacity 8h)\n  Contoso Website: 4h\n  Contoso App: 1.5h'
    );
  });

  it('does not flag a day at exactly capacity, even with floating-point noise', () => {
    expect(underOn([alloc({ hoursPerDay: 7.5 })])).toEqual([]);
    expect(underOn([alloc({ hoursPerDay: 7.4999999 })])).toEqual([]);
  });

  it('does not flag a day with nothing planned', () => {
    expect(underOn([alloc({ hoursPerDay: 0 })])).toEqual([]);
    // Allocations on another day don't count for this one
    expect(underOn([alloc({ startDate: '2026-10-06', hoursPerDay: 2 })])).toEqual([]);
  });

  it('never flags weekends', () => {
    expect(underOn([alloc({ startDate: '2026-10-10', hoursPerDay: 2 })], '2026-10-10')).toEqual([]);
    expect(underOn([alloc({ startDate: '2026-10-11', hoursPerDay: 2 })], '2026-10-11', 15)).toEqual(
      []
    );
  });

  it('never flags someone who is not counted (weekly capacity 0)', () => {
    expect(underOn([alloc({ hoursPerDay: 2 })], DAY, 0)).toEqual([]);
  });

  describe('with a weekly capacity', () => {
    // Mon 5 and Tue 6 Oct 2026 for someone on 15h a week
    const week = (hours: number[]) =>
      hours.map((hoursPerDay, i) => alloc({ startDate: `2026-10-0${5 + i}`, hoursPerDay }));

    it('sums the whole week, Monday to Sunday', () => {
      const allocations = [...week([7.5, 7.5]), alloc({ startDate: '2026-10-11', hoursPerDay: 1 })];
      const totals = buildResourceDailyTotals(allocations);
      expect(getWeekHours(totals, 'R001', '2026-10-05')).toBe(16);
      expect(getWeekHours(totals, 'R001', '2026-10-11')).toBe(16);
      expect(getWeekHours(totals, 'R001', '2026-10-12')).toBe(0);
    });

    it("flags every planned day of a week under their weekly capacity, whatever each day's hours", () => {
      const allocations = week([7.5, 4.5]);
      const totals = buildResourceDailyTotals(allocations);
      for (const date of ['2026-10-05', '2026-10-06']) {
        const [under] = underOn(allocations, date, 15);
        expect(under).toMatchObject({ plannedHours: 12, capacityHours: 15, weekly: true });
      }
      // A weekday with nothing planned stays clear
      expect(underOn(allocations, '2026-10-07', 15)).toEqual([]);
      expect(
        getUnderAllocationTitle(
          allocations,
          totals,
          '2026-10-05',
          false,
          () => 7.5,
          () => 15
        )
      ).toBe(
        'Under weekly capacity: 12h planned this week (capacity 15h a week)\n  Contoso Website: 7.5h'
      );
      expect(
        getUnderAllocationTitle(
          allocations,
          totals,
          '2026-10-06',
          true,
          () => 7.5,
          () => 15
        )
      ).toContain('Alex Contoso under weekly capacity: 12h planned this week');
    });

    it('does not flag a week at or over their weekly capacity', () => {
      expect(underOn(week([7.5, 7.5]), '2026-10-05', 15)).toEqual([]);
      // A short day is fine when the week as a whole is full
      expect(underOn(week([7.5, 3, 4.5]), '2026-10-06', 15)).toEqual([]);
      expect(underOn(week([7.5, 7.5, 3]), '2026-10-07', 15)).toEqual([]);
    });
  });
});

describe('getCapacityFlag', () => {
  it('is red when over, amber when under, and nothing at capacity', () => {
    const flag = (allocations: DailyResourceAllocation[]) =>
      getCapacityFlag(allocations, buildResourceDailyTotals(allocations), DAY)?.status;
    expect(flag([alloc({ hoursPerDay: 9 })])).toBe('over');
    expect(flag([alloc({ hoursPerDay: 5 })])).toBe('under');
    expect(flag([alloc({ hoursPerDay: 8 })])).toBeUndefined();
  });

  it('prefers red to amber on the same cell', () => {
    // A 9h Monday is over a 7.5h day, though the week is under 15h
    const allocations = [
      alloc({ hoursPerDay: 9 }),
      alloc({ startDate: '2026-10-06', hoursPerDay: 2 }),
    ];
    const totals = buildResourceDailyTotals(allocations);
    const monday = getCapacityFlag(
      allocations,
      totals,
      DAY,
      false,
      () => 7.5,
      () => 15
    );
    expect(monday?.status).toBe('over');
    expect(monday?.title).toMatch(/^Over-allocated: 9h planned/);
    expect(
      getCapacityFlag(
        allocations,
        totals,
        '2026-10-06',
        false,
        () => 7.5,
        () => 15
      )?.status
    ).toBe('under');

    // A rolled-up cell with one person over and another under is red
    const rolledUp = [
      alloc({ hoursPerDay: 9 }),
      alloc({ resourceNumber: 'R002', resourceName: 'Sam Contoso', hoursPerDay: 4 }),
    ];
    expect(getCapacityFlag(rolledUp, buildResourceDailyTotals(rolledUp), DAY, true)?.status).toBe(
      'over'
    );
  });
});
