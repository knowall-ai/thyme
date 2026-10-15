import { describe, it, expect } from 'vitest';
import type { BCJobPlanningLine, BCTimeSheetDetail, BCTimeSheetLine } from '@/types';
import {
  collectProjectTimeRows,
  getStageHoursByProject,
  sumHoursByStatus,
  sumPostedHoursByProject,
  toStageHours,
} from '@/utils/projectTime';
import { getBillingModeFromLines, getPercentOfEstimate } from '@/utils/projectBudget';
import { buildUOMConversionMap, sumEstimateHours, sumPlannedHours } from '@/utils/unitConversion';

const line = (overrides: Partial<BCTimeSheetLine>): BCTimeSheetLine => ({
  id: 'line',
  timeSheetNo: 'TS001',
  lineNo: 10000,
  type: 'Job',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  totalQuantity: 8,
  status: 'Open',
  ...overrides,
});

const detail = (overrides: Partial<BCTimeSheetDetail>): BCTimeSheetDetail => ({
  id: 'detail',
  timeSheetNo: 'TS001',
  timeSheetLineNo: 10000,
  date: '2026-10-05',
  quantity: 8,
  ...overrides,
});

const planningLine = (overrides: Partial<BCJobPlanningLine>): BCJobPlanningLine => ({
  id: 'pl',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  lineNo: 10000,
  planningDate: '2026-10-05',
  lineType: 'Billable',
  type: 'Resource',
  number: 'R0010',
  description: 'Contoso design work',
  quantity: 10,
  unitCost: 0,
  unitPrice: 0,
  totalCost: 0,
  totalPrice: 0,
  lastModifiedDateTime: '2026-10-05T00:00:00Z',
  ...overrides,
});

const resourceNoByTimesheet = new Map([
  ['TS001', 'R0010'],
  ['TS002', 'R0020'],
  ['TS009', 'MACHINE'],
]);
const people = new Set(['R0010', 'R0020']);

describe('collectProjectTimeRows', () => {
  it('keeps daily hours on Job lines logged by people', () => {
    const rows = collectProjectTimeRows(
      [line({}), line({ timeSheetNo: 'TS002', jobNo: 'PR00020' })],
      [detail({}), detail({ timeSheetNo: 'TS002', quantity: 3 })],
      resourceNoByTimesheet,
      people
    );
    expect(rows.map((r) => [r.jobNo, r.resourceNo, r.detail.quantity])).toEqual([
      ['PR00010', 'R0010', 8],
      ['PR00020', 'R0020', 3],
    ]);
  });

  it('leaves out non-Job lines, empty lines and days, and non-person resources', () => {
    const rows = collectProjectTimeRows(
      [
        line({ lineNo: 1, type: 'Absence', jobNo: undefined }),
        line({ lineNo: 2, totalQuantity: 0 }),
        line({ lineNo: 3 }),
        line({ timeSheetNo: 'TS009', lineNo: 4 }),
      ],
      [
        detail({ timeSheetLineNo: 1 }),
        detail({ timeSheetLineNo: 2 }),
        detail({ timeSheetLineNo: 3, quantity: 0 }),
        detail({ timeSheetLineNo: 3, quantity: -2 }),
        detail({ timeSheetNo: 'TS009', timeSheetLineNo: 4 }),
        detail({ timeSheetLineNo: 99 }), // no such line
      ],
      resourceNoByTimesheet,
      people
    );
    expect(rows).toEqual([]);
  });

  it("keeps only one project's hours when given a project number", () => {
    const rows = collectProjectTimeRows(
      [line({}), line({ lineNo: 20000, jobNo: 'PR00020' })],
      [detail({}), detail({ timeSheetLineNo: 20000 })],
      resourceNoByTimesheet,
      people,
      'PR00020'
    );
    expect(rows.map((r) => r.jobNo)).toEqual(['PR00020']);
  });
});

describe('sumHoursByStatus', () => {
  it('sums each status, with Rejected hours in the total only', () => {
    expect(
      sumHoursByStatus([
        { hours: 4, status: 'Approved' },
        { hours: 3, status: 'Submitted' },
        { hours: 2, status: 'Open' },
        { hours: 1, status: 'Rejected' },
      ])
    ).toEqual({ total: 10, approved: 4, submitted: 3, unsubmitted: 2 });
  });
});

describe('toStageHours', () => {
  const totals = { total: 10, approved: 6, submitted: 3, unsubmitted: 1 };

  it('takes posted hours out of approved', () => {
    expect(toStageHours(totals, 4)).toEqual({
      posted: 4,
      approved: 2,
      submitted: 3,
      unsubmitted: 1,
      total: 10,
    });
  });

  it('caps posted hours at what was approved', () => {
    expect(toStageHours(totals, 9)).toMatchObject({ posted: 6, approved: 0 });
    expect(toStageHours(totals, -1)).toMatchObject({ posted: 0, approved: 6 });
  });
});

describe('getStageHoursByProject', () => {
  it('splits each project by stage with its own posted hours', () => {
    const rows = collectProjectTimeRows(
      [
        line({ lineNo: 1, status: 'Approved' }),
        line({ lineNo: 2, status: 'Submitted' }),
        line({ lineNo: 3, jobNo: 'PR00020', status: 'Approved' }),
      ],
      [
        // Posted by the timesheet: 4 of the 6 approved hours
        detail({ timeSheetLineNo: 1, quantity: 6, postedQuantity: 4 }),
        // Only an approved line's time counts as posted
        detail({ timeSheetLineNo: 2, quantity: 2, postedQuantity: 2 }),
        detail({ timeSheetLineNo: 3, quantity: 5 }),
      ],
      resourceNoByTimesheet,
      people
    );
    expect(sumPostedHoursByProject(rows)).toEqual(
      new Map([
        ['PR00010', 4],
        ['PR00020', 0],
      ])
    );
    const stages = getStageHoursByProject(rows);
    expect(stages.get('PR00010')).toEqual({
      posted: 4,
      approved: 2,
      submitted: 2,
      unsubmitted: 0,
      total: 8,
    });
    expect(stages.get('PR00020')).toEqual({
      posted: 0,
      approved: 5,
      submitted: 0,
      unsubmitted: 0,
      total: 5,
    });
  });
});

describe('sumEstimateHours', () => {
  it('sums Billable Resource lines in hours, not the Plan', () => {
    // R0010 is DAY-based, with 7.5-hour days; R0020 is HOUR-based
    const uoms = buildUOMConversionMap([
      { resourceNo: 'R0010', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
    ] as Parameters<typeof buildUOMConversionMap>[0]);
    const lines = [
      planningLine({ lineType: 'Billable', quantity: 2 }), // 2 days = 15h
      planningLine({
        lineType: 'Both_x0020_Budget_x0020_and_x0020_Billable',
        number: 'R0020',
        quantity: 5,
      }),
      planningLine({ lineType: 'Budget', number: 'R0020', quantity: 40 }),
      planningLine({ lineType: 'Billable', type: 'Item', quantity: 3 }),
    ];
    expect(sumEstimateHours(lines, uoms)).toBe(20);
    expect(sumPlannedHours(lines, uoms)).toBe(45);
  });
});

describe('getPercentOfEstimate', () => {
  it('rounds time spent as a share of the estimate', () => {
    expect(getPercentOfEstimate(35, 50)).toBe(70);
    expect(getPercentOfEstimate(55, 50)).toBe(110);
  });

  it('has no percentage without an estimate', () => {
    expect(getPercentOfEstimate(10, 0)).toBeUndefined();
  });
});

describe('getBillingModeFromLines', () => {
  it('reads the billing mode from Billable line prices by type', () => {
    expect(getBillingModeFromLines([])).toBe('Not Set');
    expect(getBillingModeFromLines([planningLine({ totalPrice: 100 })])).toBe('T&M');
    expect(getBillingModeFromLines([planningLine({ type: 'Item', totalPrice: 100 })])).toBe(
      'Fixed Price'
    );
    expect(
      getBillingModeFromLines([
        planningLine({ totalPrice: 100 }),
        planningLine({ type: 'G/L Account', totalPrice: 50 }),
      ])
    ).toBe('Mixed');
    // Budget-only lines aren't quoted to the customer
    expect(getBillingModeFromLines([planningLine({ lineType: 'Budget', totalPrice: 100 })])).toBe(
      'Not Set'
    );
  });
});
