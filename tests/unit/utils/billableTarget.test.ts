import { describe, it, expect } from 'vitest';
import {
  hasBillableTargetFields,
  resolveBillableTarget,
  resolveCompanyDefault,
  getBillableTargetBand,
  getWeightedBillableTarget,
  getBillableTargetGap,
  formatTargetGap,
  parseTargetPercent,
  describeTargetSaveError,
} from '@/utils/billableTarget';
import { teamConfig, getTimesheetCompletionColor } from '@/config';

describe('hasBillableTargetFields', () => {
  it('is false when the extension returns no target fields', () => {
    expect(hasBillableTargetFields([{}, {}])).toBe(false);
    expect(hasBillableTargetFields([])).toBe(false);
  });

  it('is true once any resource has the not-set flag', () => {
    expect(hasBillableTargetFields([{}, { billableTargetSet: false }])).toBe(true);
  });
});

describe('resolveBillableTarget', () => {
  it("uses the person's own target when set", () => {
    expect(
      resolveBillableTarget({ billableTargetPercent: 80, billableTargetSet: true }, 75)
    ).toEqual({ percent: 80, isDefault: false });
  });

  it('allows an own target of 0%', () => {
    expect(
      resolveBillableTarget({ billableTargetPercent: 0, billableTargetSet: true }, 75)
    ).toEqual({ percent: 0, isDefault: false });
  });

  it('falls back to the company default when not set', () => {
    expect(
      resolveBillableTarget({ billableTargetPercent: 90, billableTargetSet: false }, 75)
    ).toEqual({ percent: 75, isDefault: true });
    expect(resolveBillableTarget({}, 60)).toEqual({ percent: 60, isDefault: true });
  });

  it('ignores an invalid own target', () => {
    expect(
      resolveBillableTarget({ billableTargetPercent: 140, billableTargetSet: true }, 75)
    ).toEqual({ percent: 75, isDefault: true });
  });
});

describe('resolveCompanyDefault', () => {
  it('uses the Thyme Setup default when valid', () => {
    expect(resolveCompanyDefault(70)).toBe(70);
  });

  it('falls back to the config default when missing or invalid', () => {
    const fallback = teamConfig.billableTarget.fallbackDefaultPercent;
    expect(resolveCompanyDefault(null)).toBe(fallback);
    expect(resolveCompanyDefault(undefined)).toBe(fallback);
    expect(resolveCompanyDefault(-5)).toBe(fallback);
  });
});

describe('getBillableTargetBand', () => {
  const bands = { onTarget: 5, nearTarget: 15 };

  it('is on target at, above or within 5 points below target', () => {
    expect(getBillableTargetBand(80, 80, true, bands)).toBe('on');
    expect(getBillableTargetBand(100, 80, true, bands)).toBe('on');
    expect(getBillableTargetBand(75, 80, true, bands)).toBe('on');
  });

  it('is near target within 15 points below', () => {
    expect(getBillableTargetBand(74.9, 80, true, bands)).toBe('near');
    expect(getBillableTargetBand(65, 80, true, bands)).toBe('near');
  });

  it('is off target more than 15 points below', () => {
    expect(getBillableTargetBand(64.9, 80, true, bands)).toBe('off');
    expect(getBillableTargetBand(0, 80, true, bands)).toBe('off');
  });

  it('is neutral when no hours were logged', () => {
    expect(getBillableTargetBand(0, 80, false, bands)).toBe('none');
  });

  it('uses the configured bands by default', () => {
    const { onTarget, nearTarget } = teamConfig.billableTarget.bands;
    expect(getBillableTargetBand(80 - onTarget, 80)).toBe('on');
    expect(getBillableTargetBand(80 - nearTarget, 80)).toBe('near');
    expect(getBillableTargetBand(80 - nearTarget - 1, 80)).toBe('off');
  });
});

describe('getWeightedBillableTarget', () => {
  it('weights each target by capacity', () => {
    // 40h at 80% and 20h at 50%: (3200 + 1000) / 60 = 70
    expect(
      getWeightedBillableTarget([
        { capacity: 40, targetPercent: 80 },
        { capacity: 20, targetPercent: 50 },
      ])
    ).toBeCloseTo(70);
  });

  it('skips people with no capacity', () => {
    expect(
      getWeightedBillableTarget([
        { capacity: 0, targetPercent: 10 },
        { capacity: 37.5, targetPercent: 75 },
      ])
    ).toBe(75);
  });

  it('is null with no capacity at all', () => {
    expect(getWeightedBillableTarget([])).toBeNull();
    expect(getWeightedBillableTarget([{ capacity: 0, targetPercent: 75 }])).toBeNull();
  });
});

describe('gap to target', () => {
  it('is actual minus target', () => {
    expect(getBillableTargetGap(72, 80)).toBe(-8);
    expect(getBillableTargetGap(83, 80)).toBe(3);
  });

  it('says how far above or below target, in plain words', () => {
    expect(formatTargetGap(-8)).toBe('8% below target');
    expect(formatTargetGap(-37.6)).toBe('38% below target');
    expect(formatTargetGap(3.4)).toBe('3% above target');
    expect(formatTargetGap(0.2)).toBe('On target');
    expect(formatTargetGap(-0.49)).toBe('On target');
    expect(formatTargetGap(-14, 'the team target')).toBe('14% below the team target');
  });
});

describe('parseTargetPercent', () => {
  it('accepts numbers from 0 to 100', () => {
    expect(parseTargetPercent('0')).toBe(0);
    expect(parseTargetPercent(' 80 ')).toBe(80);
    expect(parseTargetPercent('100')).toBe(100);
    expect(parseTargetPercent('72.555')).toBe(72.56);
  });

  it('rejects empty, non-numeric and out-of-range input', () => {
    expect(parseTargetPercent('')).toBeNull();
    expect(parseTargetPercent('abc')).toBeNull();
    expect(parseTargetPercent('-1')).toBeNull();
    expect(parseTargetPercent('101')).toBeNull();
  });
});

describe('describeTargetSaveError', () => {
  it('explains a permission error', () => {
    expect(describeTargetSaveError(new Error('BC API Error (403): Forbidden'))).toMatch(
      /permission/
    );
  });

  it('explains a missing extension feature', () => {
    expect(describeTargetSaveError(new Error('BC API Error (404): nope'))).toMatch(/newer/);
  });

  it('falls back to a generic message', () => {
    expect(describeTargetSaveError(new Error('boom'))).toMatch(/Failed to save/);
  });
});

describe('getTimesheetCompletionColor', () => {
  it('is green from 95%, amber from 70% and red below', () => {
    const { colors } = teamConfig.timesheetCompletion;
    expect(getTimesheetCompletionColor(100)).toBe(colors.high);
    expect(getTimesheetCompletionColor(95)).toBe(colors.high);
    expect(getTimesheetCompletionColor(94.9)).toBe(colors.medium);
    expect(getTimesheetCompletionColor(70)).toBe(colors.medium);
    expect(getTimesheetCompletionColor(69.9)).toBe(colors.low);
  });
});
