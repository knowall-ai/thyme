import { describe, it, expect } from 'vitest';
import {
  DAILY_CAPACITY_HOURS,
  buildResourceDailyTotals,
  getOverAllocationHours,
  getOverAllocatedResources,
  getOverAllocationTitle,
  type DailyResourceAllocation,
} from '@/utils/capacity';

const DAY = '2026-10-05';

function alloc(partial: Partial<DailyResourceAllocation>): DailyResourceAllocation {
  return {
    resourceNumber: 'R001',
    resourceName: 'Akash Jadhav',
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
    expect(totals.get(`R001|${DAY}`)).toBe(7.5);
  });
});

describe('getOverAllocatedResources', () => {
  it('sums a resource across projects before comparing to capacity', () => {
    const projectA = alloc({ hoursPerDay: 24 });
    const projectB = alloc({ hoursPerDay: 1.5 });
    const totals = buildResourceDailyTotals([projectA, projectB]);

    // Only project A's allocation is in this cell, but the total spans both projects
    expect(getOverAllocatedResources([projectA], totals, DAY)).toEqual([
      {
        resourceNumber: 'R001',
        resourceName: 'Akash Jadhav',
        allocatedHours: 25.5,
        overByHours: 17.5,
      },
    ]);
  });

  it('flags a cell that is within capacity on its own when the day total is over', () => {
    const projectA = alloc({ hoursPerDay: 5 });
    const projectB = alloc({ hoursPerDay: 5 });
    const totals = buildResourceDailyTotals([projectA, projectB]);

    expect(getOverAllocatedResources([projectA], totals, DAY)).toHaveLength(1);
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
      alloc({ resourceNumber: 'R002', resourceName: 'Ben Weeks', hoursPerDay: 9 }),
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

  it('describes the over-allocation', () => {
    const allocations = [alloc({ hoursPerDay: 24 }), alloc({ hoursPerDay: 1.5 })];
    expect(getOverAllocationTitle(allocations, buildResourceDailyTotals(allocations), DAY)).toBe(
      'Over by 17.5h (25.5h allocated / 8h capacity)'
    );
  });

  it('prefixes resource names for rolled-up rows', () => {
    const allocations = [
      alloc({ hoursPerDay: 10 }),
      alloc({ resourceNumber: 'R002', resourceName: 'Ben Weeks', hoursPerDay: 9 }),
    ];
    expect(
      getOverAllocationTitle(allocations, buildResourceDailyTotals(allocations), DAY, true)
    ).toBe(
      'Akash Jadhav: Over by 2h (10h allocated / 8h capacity)\nBen Weeks: Over by 1h (9h allocated / 8h capacity)'
    );
  });
});
