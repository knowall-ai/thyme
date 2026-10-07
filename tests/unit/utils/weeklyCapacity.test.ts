import { describe, it, expect } from 'vitest';
import {
  buildUOMConversionMap,
  describeCapacitySaveError,
  describeWeeklyCapacity,
  hasWeeklyCapacityFields,
  parseWeeklyCapacityHours,
  resolveWeeklyCapacity,
} from '@/utils';
import type { BCResourceUnitOfMeasure } from '@/types';

const uoms = buildUOMConversionMap([
  { resourceNo: 'R1', code: 'HOUR', qtyPerUnitOfMeasure: 7.5 },
] as BCResourceUnitOfMeasure[]);

describe('hasWeeklyCapacityFields', () => {
  it('is false on extensions without the fields', () => {
    expect(hasWeeklyCapacityFields([{}, {}])).toBe(false);
  });

  it('is true once any resource returns the flag', () => {
    expect(hasWeeklyCapacityFields([{}, { weeklyCapacitySet: false }])).toBe(true);
  });
});

describe('resolveWeeklyCapacity', () => {
  it('falls back to hours per day x 5 without the fields (older extensions)', () => {
    const c = resolveWeeklyCapacity({ number: 'R1' }, uoms, 40);
    expect(c).toMatchObject({
      hours: 37.5,
      hoursPerDay: 7.5,
      defaultHours: 37.5,
      isSet: false,
      excluded: false,
      flexible: false,
    });
  });

  it('uses the configured fallback when BC has no hours per day', () => {
    const c = resolveWeeklyCapacity({ number: 'R2' }, uoms, 40);
    expect(c.hours).toBe(40);
    expect(c.hoursPerDay).toBe(8);
  });

  it('falls back when not set, ignoring any stray hours', () => {
    const c = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: false, weeklyCapacityHours: 15 },
      uoms,
      40
    );
    expect(c.hours).toBe(37.5);
    expect(c.isSet).toBe(false);
  });

  it("uses the person's own weekly capacity, e.g. two days a week on flexible days", () => {
    const c = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: true, weeklyCapacityHours: 15, flexibleWorkingDays: true },
      uoms,
      40
    );
    expect(c).toMatchObject({ hours: 15, hoursPerDay: 7.5, isSet: true, flexible: true });
    expect(c.excluded).toBe(false);
  });

  it('treats an explicit 0 as listed but not counted, and never flexible', () => {
    const c = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: true, weeklyCapacityHours: 0, flexibleWorkingDays: true },
      uoms,
      40
    );
    expect(c).toMatchObject({ hours: 0, isSet: true, excluded: true, flexible: false });
  });

  it('ignores an out-of-range value and uses the default', () => {
    const c = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: true, weeklyCapacityHours: 500 },
      uoms,
      40
    );
    expect(c.hours).toBe(37.5);
    expect(c.isSet).toBe(false);
  });
});

describe('parseWeeklyCapacityHours', () => {
  it('accepts 0 to 168, rounded to 2dp', () => {
    expect(parseWeeklyCapacityHours('15')).toBe(15);
    expect(parseWeeklyCapacityHours(' 0 ')).toBe(0);
    expect(parseWeeklyCapacityHours('22.555')).toBe(22.56);
    expect(parseWeeklyCapacityHours('168')).toBe(168);
  });

  it('rejects blanks, negatives, too many hours and text', () => {
    expect(parseWeeklyCapacityHours('')).toBeNull();
    expect(parseWeeklyCapacityHours('-1')).toBeNull();
    expect(parseWeeklyCapacityHours('169')).toBeNull();
    expect(parseWeeklyCapacityHours('two days')).toBeNull();
  });
});

describe('describeWeeklyCapacity', () => {
  it('describes own, default, flexible and not-counted capacity', () => {
    const own = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: true, weeklyCapacityHours: 15, flexibleWorkingDays: true },
      uoms,
      40
    );
    expect(describeWeeklyCapacity(own)).toBe('15h a week, flexible days');
    expect(describeWeeklyCapacity(resolveWeeklyCapacity({ number: 'R1' }, uoms, 40))).toBe(
      '37.5h a week (default: 7.5h x 5)'
    );
    const zero = resolveWeeklyCapacity(
      { number: 'R1', weeklyCapacitySet: true, weeklyCapacityHours: 0 },
      uoms,
      40
    );
    expect(describeWeeklyCapacity(zero)).toMatch(/^Not counted/);
  });
});

describe('describeCapacitySaveError', () => {
  it('explains permission, conflict and old-extension failures', () => {
    expect(describeCapacitySaveError(new Error('BC API error (403): x'))).toMatch(/permission/);
    expect(describeCapacitySaveError(new Error('BC API error (412): x'))).toMatch(/meantime/);
    expect(
      describeCapacitySaveError(
        new Error(
          `BC Custom API Error (400): {"error":{"message":"The property 'weeklyCapacityHours' does not exist on type 'Microsoft.NAV.resource'."}}`
        )
      )
    ).toMatch(/newer version/);
    expect(
      describeCapacitySaveError(
        new Error(
          'BC Custom API Error (400): {"error":{"message":"The weekly capacity must be from 0 to 168 hours.  CorrelationId:  2db18b79-3a6c-4289-8490-b3c843993119."}}'
        )
      )
    ).toBe(
      'Business Central rejected the change: The weekly capacity must be from 0 to 168 hours.'
    );
    expect(describeCapacitySaveError(new Error('boom'))).toMatch(/Failed to save/);
    // Escaped quotes in BC's message survive; an unparsable body gets the generic text
    expect(
      describeCapacitySaveError(
        new Error('BC Custom API Error (400): {"error":{"message":"Value \\"200\\" is too high."}}')
      )
    ).toBe('Business Central rejected the change: Value "200" is too high.');
    expect(describeCapacitySaveError(new Error('BC Custom API Error (400): <html>'))).toBe(
      'Business Central rejected the change. Check the hours and try again.'
    );
  });
});
