import { describe, it, expect } from 'vitest';
import {
  DAILY_CAPACITY_HOURS,
  buildResourceDailyTotals,
  getOverAllocationHours,
  getOverAllocatedResources,
  getOverAllocationTitle,
  getWeekToDateHours,
  formatOverAllocation,
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
