import { describe, it, expect } from 'vitest';
import { getStageHours, addStageHours, emptyStageHours } from '@/utils/timesheetStatus';
import type { BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

function line(
  lineNo: number,
  status: BCTimeSheetLine['status'],
  type: BCTimeSheetLine['type'] = 'Job'
): BCTimeSheetLine {
  return {
    id: `l${lineNo}`,
    timeSheetNo: 'TS001',
    lineNo,
    type,
    jobNo: 'CONTOSO-01',
    totalQuantity: 0,
    status,
  };
}

function detail(lineNo: number, quantity: number, postedQuantity?: number): BCTimeSheetDetail {
  return {
    id: `d${lineNo}-${quantity}`,
    timeSheetNo: 'TS001',
    timeSheetLineNo: lineNo,
    date: '2026-09-28',
    quantity,
    postedQuantity,
  };
}

describe('getStageHours', () => {
  it('counts each hour once, in the latest stage it has reached', () => {
    const lines = [line(1, 'Approved'), line(2, 'Submitted'), line(3, 'Open')];
    const details = [detail(1, 8, 8), detail(1, 4, 0), detail(2, 6), detail(3, 2)];
    expect(getStageHours(lines, details)).toEqual({
      posted: 8,
      approved: 4,
      submitted: 6,
      unsubmitted: 2,
      total: 20,
    });
  });

  it('counts rejected hours in the total only', () => {
    const stages = getStageHours(
      [line(1, 'Rejected'), line(2, 'Open')],
      [detail(1, 5), detail(2, 3)]
    );
    expect(stages).toEqual({ posted: 0, approved: 0, submitted: 0, unsubmitted: 3, total: 8 });
  });

  it('never counts more posted hours than were logged that day', () => {
    const stages = getStageHours([line(1, 'Approved')], [detail(1, 4, 6)]);
    expect(stages.posted).toBe(4);
    expect(stages.approved).toBe(0);
  });

  it('ignores posted quantity on lines that are not approved', () => {
    const stages = getStageHours([line(1, 'Submitted')], [detail(1, 4, 4)]);
    expect(stages).toEqual({ posted: 0, approved: 0, submitted: 4, unsubmitted: 0, total: 4 });
  });

  it('only counts project (Job) lines with hours', () => {
    const lines = [line(1, 'Open', 'Absence'), line(2, 'Open')];
    const details = [detail(1, 8), detail(2, 0), detail(3, 5)];
    expect(getStageHours(lines, details)).toEqual(emptyStageHours());
  });
});

describe('addStageHours', () => {
  it('adds stage by stage', () => {
    const a = { posted: 1, approved: 2, submitted: 3, unsubmitted: 4, total: 10 };
    expect(addStageHours(a, a)).toEqual({
      posted: 2,
      approved: 4,
      submitted: 6,
      unsubmitted: 8,
      total: 20,
    });
  });
});
