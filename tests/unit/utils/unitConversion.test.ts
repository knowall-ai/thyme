import { describe, it, expect } from 'vitest';
import {
  buildUOMConversionMap,
  getHoursPerDay,
  convertToHours,
  convertFromHours,
  isResourceDayBased,
  isBudgetPlanningLine,
  sumPlannedHours,
} from '@/utils/unitConversion';
import type { BCJobPlanningLine, BCResourceUnitOfMeasure } from '@/types';

// Helper to create planning-line records with the fields the helpers care about.
function makeLine(partial: Partial<BCJobPlanningLine>): BCJobPlanningLine {
  return {
    id: 'planning-line',
    jobNo: 'PR00010',
    jobTaskNo: '1000',
    lineNo: 1000,
    planningDate: '2026-01-01',
    lineType: 'Budget',
    type: 'Resource',
    number: 'R001',
    description: '',
    quantity: 0,
    unitCost: 0,
    unitPrice: 0,
    totalCost: 0,
    totalPrice: 0,
    ...partial,
  } as BCJobPlanningLine;
}

// Helper to create UOM records with required fields
function makeUOM(
  resourceNo: string,
  code: string,
  qtyPerUnitOfMeasure: number
): BCResourceUnitOfMeasure {
  return {
    id: `${resourceNo}-${code}`,
    resourceNo,
    code,
    qtyPerUnitOfMeasure,
    relatedToBaseUnitOfMeasure: code === 'DAY',
    lastModifiedDateTime: '2024-01-01T00:00:00Z',
  };
}

describe('unitConversion', () => {
  describe('buildUOMConversionMap', () => {
    it('builds map with resourceNo:code keys', () => {
      const uoms = [makeUOM('R001', 'HOUR', 7.5), makeUOM('R001', 'DAY', 1)];
      const map = buildUOMConversionMap(uoms);
      expect(map.get('R001:HOUR')).toBe(7.5);
      expect(map.get('R001:DAY')).toBe(1);
    });

    it('returns empty map for empty input', () => {
      const map = buildUOMConversionMap([]);
      expect(map.size).toBe(0);
    });
  });

  describe('getHoursPerDay', () => {
    it('returns factor when HOUR > 1 (e.g., 7.5 hours/day)', () => {
      const uoms = [makeUOM('R001', 'HOUR', 7.5)];
      expect(getHoursPerDay(uoms, 'R001')).toBe(7.5);
    });

    it('inverts factor when HOUR < 1 (e.g., 0.125 = 8 hours/day)', () => {
      const uoms = [makeUOM('R001', 'HOUR', 0.125)];
      expect(getHoursPerDay(uoms, 'R001')).toBe(8);
    });

    it('returns default 8 when resource not found (no global fallback)', () => {
      const uoms = [makeUOM('R001', 'HOUR', 7.5)];
      expect(getHoursPerDay(uoms, 'R999')).toBe(8);
    });

    it('returns default 8 when no HOUR factors exist', () => {
      const uoms = [makeUOM('R001', 'DAY', 1)];
      expect(getHoursPerDay(uoms)).toBe(8);
    });

    it('ignores HOUR factor of exactly 1', () => {
      const uoms = [makeUOM('R001', 'HOUR', 1)];
      expect(getHoursPerDay(uoms, 'R001')).toBe(8);
    });

    it('ignores zero or negative qtyPerUnitOfMeasure', () => {
      const uoms = [makeUOM('R001', 'HOUR', 0), makeUOM('R002', 'HOUR', -1)];
      expect(getHoursPerDay(uoms, 'R001')).toBe(8);
      expect(getHoursPerDay(uoms, 'R002')).toBe(8);
    });
  });

  describe('convertToHours', () => {
    it('converts DAY quantity to hours (HOUR > 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 7.5)]);
      // 0.8 days × 7.5 = 6 hours
      expect(convertToHours('R001', 0.8, map)).toBeCloseTo(6);
    });

    it('converts DAY quantity to hours (HOUR < 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 0.125)]);
      // 0.5 days × (1/0.125) = 0.5 × 8 = 4 hours
      expect(convertToHours('R001', 0.5, map)).toBeCloseTo(4);
    });

    it('returns quantity as-is for HOUR-based resources', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      expect(convertToHours('R001', 4, map)).toBe(4);
    });

    it('returns quantity as-is when no conversion found', () => {
      const map = buildUOMConversionMap([]);
      expect(convertToHours('R001', 4, map)).toBe(4);
    });

    it('handles zero/negative factor safely', () => {
      const map = new Map([['R001:HOUR', 0]]);
      expect(convertToHours('R001', 4, map)).toBe(4);
    });
  });

  describe('convertFromHours', () => {
    it('converts hours to DAY quantity (HOUR > 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 7.5)]);
      // 6 hours / 7.5 = 0.8 days
      expect(convertFromHours('R001', 6, map)).toBeCloseTo(0.8);
    });

    it('converts hours to DAY quantity (HOUR < 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 0.125)]);
      // 4 hours / 8 = 0.5 days
      expect(convertFromHours('R001', 4, map)).toBeCloseTo(0.5);
    });

    it('returns hours as-is for HOUR-based resources', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      expect(convertFromHours('R001', 4, map)).toBe(4);
    });

    it('is the inverse of convertToHours', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 7.5)]);
      const days = 1.5;
      const hours = convertToHours('R001', days, map);
      expect(convertFromHours('R001', hours, map)).toBeCloseTo(days);
    });
  });

  describe('isResourceDayBased', () => {
    it('returns true for DAY-based resources (HOUR > 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 7.5)]);
      expect(isResourceDayBased('R001', map)).toBe(true);
    });

    it('returns true for DAY-based resources (HOUR < 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 0.125)]);
      expect(isResourceDayBased('R001', map)).toBe(true);
    });

    it('returns false for HOUR-based resources (factor = 1)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      expect(isResourceDayBased('R001', map)).toBe(false);
    });

    it('returns false when no conversion found', () => {
      const map = buildUOMConversionMap([]);
      expect(isResourceDayBased('R001', map)).toBe(false);
    });

    it('returns false for zero factor', () => {
      const map = new Map([['R001:HOUR', 0]]);
      expect(isResourceDayBased('R001', map)).toBe(false);
    });
  });

  describe('isBudgetPlanningLine', () => {
    it('accepts the plain "Budget" lineType', () => {
      expect(isBudgetPlanningLine('Budget')).toBe(true);
    });

    it('accepts the plain "Both Budget and Billable" lineType', () => {
      expect(isBudgetPlanningLine('Both Budget and Billable')).toBe(true);
    });

    it('accepts the URL-encoded "Both_x0020_Budget_x0020_and_x0020_Billable" lineType', () => {
      expect(isBudgetPlanningLine('Both_x0020_Budget_x0020_and_x0020_Billable')).toBe(true);
    });

    it('rejects the "Billable" lineType', () => {
      expect(isBudgetPlanningLine('Billable')).toBe(false);
    });

    it('rejects undefined and unknown values', () => {
      expect(isBudgetPlanningLine(undefined)).toBe(false);
      expect(isBudgetPlanningLine('Something Else')).toBe(false);
      expect(isBudgetPlanningLine('')).toBe(false);
    });
  });

  describe('sumPlannedHours', () => {
    it('sums Resource Budget lines, converting DAY quantities to hours', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 7.5)]);
      const lines = [
        makeLine({ type: 'Resource', lineType: 'Budget', number: 'R001', quantity: 4 }),
        makeLine({ type: 'Resource', lineType: 'Budget', number: 'R001', quantity: 2 }),
      ];
      // 4d × 7.5 + 2d × 7.5 = 30 + 15 = 45h
      expect(sumPlannedHours(lines, map)).toBeCloseTo(45);
    });

    it('counts "Both Budget and Billable" lines (plain and encoded forms)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      const lines = [
        makeLine({ type: 'Resource', lineType: 'Both Budget and Billable', quantity: 3 }),
        makeLine({
          type: 'Resource',
          lineType: 'Both_x0020_Budget_x0020_and_x0020_Billable',
          quantity: 5,
        }),
      ];
      expect(sumPlannedHours(lines, map)).toBe(8);
    });

    it('excludes Billable-only lines', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      const lines = [
        makeLine({ type: 'Resource', lineType: 'Budget', quantity: 4 }),
        makeLine({ type: 'Resource', lineType: 'Billable', quantity: 100 }),
      ];
      expect(sumPlannedHours(lines, map)).toBe(4);
    });

    it('excludes non-Resource lines (Item, G/L Account)', () => {
      const map = buildUOMConversionMap([makeUOM('R001', 'HOUR', 1)]);
      const lines = [
        makeLine({ type: 'Resource', lineType: 'Budget', quantity: 4 }),
        makeLine({ type: 'Item', lineType: 'Budget', quantity: 100 }),
        makeLine({ type: 'G/L Account', lineType: 'Budget', quantity: 100 }),
      ];
      expect(sumPlannedHours(lines, map)).toBe(4);
    });

    it('returns 0 for an empty list', () => {
      const map = buildUOMConversionMap([]);
      expect(sumPlannedHours([], map)).toBe(0);
    });

    it('uses raw quantity when the resource has no UoM conversion', () => {
      const map = buildUOMConversionMap([]);
      const lines = [makeLine({ type: 'Resource', lineType: 'Budget', quantity: 6.5 })];
      expect(sumPlannedHours(lines, map)).toBe(6.5);
    });
  });
});
