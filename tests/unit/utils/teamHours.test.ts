import { describe, it, expect } from 'vitest';
import { getPersonHours, summariseHours } from '@/utils/teamHours';
import type { BCResource, BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

// CRONUS UK Ltd.-style demo data: a customer project and an internal one
const projects = new Map([
  ['PR-CONTOSO', { billToCustomerNo: 'C10000', billToCustomerName: 'Contoso Ltd.' }],
  ['INT-ADMIN', { billToCustomerNo: 'C99999', billToCustomerName: 'CRONUS - Internal' }],
]);

const resource = (number: string, name: string): BCResource => ({
  id: `id-${number}`,
  number,
  name,
  type: 'Person',
  useTimeSheet: true,
  timeSheetOwnerUserId: name.toUpperCase().replace(' ', '.'),
});

const line = (
  lineNo: number,
  jobNo: string,
  extra: Partial<BCTimeSheetLine> = {}
): BCTimeSheetLine =>
  ({
    id: `line-${lineNo}`,
    timeSheetNo: 'TS1',
    lineNo,
    type: 'Job',
    jobNo,
    jobTaskNo: '1000',
    status: 'Open',
    chargeable: true,
    ...extra,
  }) as BCTimeSheetLine;

const detail = (lineNo: number, date: string, quantity: number): BCTimeSheetDetail =>
  ({
    id: `d-${lineNo}-${date}`,
    timeSheetNo: 'TS1',
    timeSheetLineNo: lineNo,
    date,
    quantity,
  }) as BCTimeSheetDetail;

const week = { from: '2026-10-05', to: '2026-10-11' };

describe('getPersonHours', () => {
  it('counts project time in the period, split billable / internal and by stage', () => {
    const hours = getPersonHours(
      resource('R1', 'Alex Contoso'),
      37.5,
      [
        {
          lines: [
            line(10000, 'PR-CONTOSO'),
            line(20000, 'INT-ADMIN'),
            line(30000, 'PR-CONTOSO', { status: 'Submitted' }),
          ],
          details: [
            detail(10000, '2026-10-06', 6),
            detail(20000, '2026-10-07', 2.5),
            detail(30000, '2026-10-08', 1.25),
          ],
        },
      ],
      projects,
      week
    );
    expect(hours.stages.total).toBe(9.75);
    expect(hours.stages.unsubmitted).toBe(8.5);
    expect(hours.stages.submitted).toBe(1.25);
    expect(hours.billableHours).toBe(7.25);
    expect(hours.entries).toHaveLength(3);
    expect(hours.entries.reduce((sum, e) => sum + e.hours, 0)).toBe(hours.stages.total);
    expect(hours.entries.filter((e) => e.isBillable).map((e) => e.projectId)).toEqual([
      'PR-CONTOSO',
      'PR-CONTOSO',
    ]);
  });

  it('leaves out time outside the period, non-project lines and empty details', () => {
    const hours = getPersonHours(
      resource('R1', 'Alex Contoso'),
      37.5,
      [
        {
          lines: [line(10000, 'PR-CONTOSO'), line(20000, '', { type: 'Absence' })],
          details: [
            detail(10000, '2026-10-04', 8), // the week before
            detail(10000, '2026-10-05', 0),
            detail(10000, '2026-10-09', 3),
            detail(20000, '2026-10-09', 4),
          ],
        },
      ],
      projects,
      week
    );
    expect(hours.stages.total).toBe(3);
    expect(hours.entries.map((e) => e.date)).toEqual(['2026-10-09']);
  });

  it('counts project lines without a task, so totals match the time sheet', () => {
    const hours = getPersonHours(
      resource('R1', 'Alex Contoso'),
      37.5,
      [
        {
          lines: [line(10000, 'PR-CONTOSO', { jobTaskNo: '' })],
          details: [detail(10000, '2026-10-05', 2)],
        },
      ],
      projects,
      week
    );
    expect(hours.stages.total).toBe(2);
    expect(hours.entries).toHaveLength(1);
  });
});

describe('summariseHours', () => {
  const stages = (total: number) => ({
    total,
    posted: 0,
    approved: 0,
    submitted: 0,
    unsubmitted: total,
  });

  it('totals hours, capacity and billable %, with a capacity-weighted team target', () => {
    const summary = summariseHours([
      { capacity: 37.5, stages: stages(9.75), billableHours: 7.25, targetPercent: 75 },
      { capacity: 37.5, stages: stages(6), billableHours: 2.5, targetPercent: 80 },
      { capacity: 37.5, stages: stages(0), billableHours: 0, targetPercent: 80 },
      { capacity: 18.75, stages: stages(0), billableHours: 0, targetPercent: 75 },
    ]);
    expect(summary.totalHours).toBe(15.75);
    expect(summary.billableHours).toBe(9.75);
    expect(summary.nonBillableHours).toBe(6);
    expect(summary.capacity).toBe(131.25);
    expect(summary.completion).toBeCloseTo(12);
    expect(summary.billablePercent).toBeCloseTo(61.9, 1);
    // (37.5*75 + 37.5*80 + 37.5*80 + 18.75*75) / 131.25
    expect(summary.billableTarget).toBeCloseTo(77.86, 2);
  });

  it('gives a zero-capacity person no weight in the team target', () => {
    const summary = summariseHours([
      { capacity: 37.5, stages: stages(10), billableHours: 8, targetPercent: 80 },
      { capacity: 0, stages: stages(0), billableHours: 0, targetPercent: 0 },
    ]);
    expect(summary.capacity).toBe(37.5);
    expect(summary.billableTarget).toBe(80);
  });

  it('has no team target when targets are unavailable or nobody is selected', () => {
    expect(
      summariseHours([{ capacity: 37.5, stages: stages(1), billableHours: 1, targetPercent: null }])
        .billableTarget
    ).toBeNull();
    const empty = summariseHours([]);
    expect(empty.billableTarget).toBeNull();
    expect(empty.billablePercent).toBe(0);
    expect(empty.completion).toBe(0);
  });
});
