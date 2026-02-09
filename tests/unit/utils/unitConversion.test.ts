import { describe, it, expect } from 'vitest';
import {
  buildUOMConversionMap,
  getHoursPerDay,
  convertToHours,
  convertFromHours,
  isResourceDayBased,
} from '@/utils/unitConversion';
import type { BCResourceUnitOfMeasure } from '@/types';

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

    it('falls back to global HOUR factor when resource not found', () => {
      const uoms = [makeUOM('R001', 'HOUR', 7.5)];
      expect(getHoursPerDay(uoms, 'R999')).toBe(7.5);
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
});
