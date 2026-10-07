import { describe, it, expect } from 'vitest';
import { getAbsenceTaskNos, isAbsenceTask, withoutAbsenceLines } from '@/utils/billable';
import { compareByRemaining, getRemainingHours } from '@/utils/projectBudget';

describe('isAbsenceTask', () => {
  it('matches descriptions starting with Absence, ignoring case and leading space', () => {
    expect(isAbsenceTask('Absence - Holiday')).toBe(true);
    expect(isAbsenceTask('  absence: sick leave')).toBe(true);
  });

  it('does not match other tasks or missing descriptions', () => {
    expect(isAbsenceTask('Development')).toBe(false);
    expect(isAbsenceTask('Planned Absence')).toBe(false);
    expect(isAbsenceTask(undefined)).toBe(false);
  });
});

describe('absence planning lines', () => {
  const tasks = [
    { jobTaskNo: '1000', description: 'Absence - Holiday' },
    { jobTaskNo: '2000', description: 'Build' },
  ];
  const lines = [{ jobTaskNo: '1000' }, { jobTaskNo: '2000' }];

  it('finds the absence task numbers', () => {
    expect([...getAbsenceTaskNos(tasks)]).toEqual(['1000']);
  });

  it('drops absence lines from a non-internal project', () => {
    expect(withoutAbsenceLines(lines, getAbsenceTaskNos(tasks), false)).toEqual([
      { jobTaskNo: '2000' },
    ]);
  });

  it('keeps every line on an internal project', () => {
    expect(withoutAbsenceLines(lines, getAbsenceTaskNos(tasks), true)).toEqual(lines);
  });
});

describe('getRemainingHours', () => {
  it('is budget minus spent for a normal project', () => {
    expect(getRemainingHours({ budgetHours: 100, totalHours: 40 })).toBe(60);
    expect(getRemainingHours({ budgetHours: 10, totalHours: 40 })).toBe(-30);
  });

  it('is undefined for an internal project, however large its plan', () => {
    expect(getRemainingHours({ isInternal: true, budgetHours: 8, totalHours: 112 })).toBe(
      undefined
    );
  });

  it('is undefined without a budget or hours', () => {
    expect(getRemainingHours({ totalHours: 5 })).toBe(undefined);
    expect(getRemainingHours({ budgetHours: 5 })).toBe(undefined);
  });
});

describe('compareByRemaining', () => {
  const a = { budgetHours: 100, totalHours: 90 }; // 10 left
  const b = { budgetHours: 100, totalHours: 20 }; // 80 left
  const internal = { isInternal: true, budgetHours: 8, totalHours: 112 };

  it('sorts external projects by remaining hours', () => {
    expect([b, a].sort((x, y) => compareByRemaining(x, y, 1))).toEqual([a, b]);
    expect([a, b].sort((x, y) => compareByRemaining(x, y, -1))).toEqual([b, a]);
  });

  it('puts internal projects last in both directions', () => {
    expect([internal, a, b].sort((x, y) => compareByRemaining(x, y, 1))).toEqual([a, b, internal]);
    expect([internal, a, b].sort((x, y) => compareByRemaining(x, y, -1))).toEqual([b, a, internal]);
  });
});
