import { describe, it, expect } from 'vitest';
import {
  getProjectCurrencyCode,
  isForeignCurrency,
  planningLineCostLCY,
  timeEntryPriceProjectCurrency,
  formatCurrency,
  formatCurrencyShort,
  getCurrencySymbol,
} from '@/utils/currency';
import type { BCJobPlanningLine, BCTimeEntry } from '@/types';

const planningLine = (overrides: Partial<BCJobPlanningLine>): BCJobPlanningLine => ({
  id: 'l1',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  lineNo: 10000,
  planningDate: '2026-10-05',
  lineType: 'Budget',
  type: 'Resource',
  number: 'R0010',
  description: 'Contoso design work',
  quantity: 10,
  unitCost: 50,
  unitPrice: 100,
  totalCost: 500,
  totalPrice: 1000,
  lastModifiedDateTime: '2026-10-05T00:00:00Z',
  ...overrides,
});

const timeEntry = (overrides: Partial<BCTimeEntry>): BCTimeEntry => ({
  id: 'e1',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  resourceNo: 'R0010',
  quantity: 8,
  totalCost: 400,
  totalPrice: 800,
  postingDate: '2026-10-05',
  ...overrides,
});

describe('getProjectCurrencyCode', () => {
  it("uses the project's currency code when it has one", () => {
    expect(getProjectCurrencyCode('EUR', 'GBP')).toBe('EUR');
  });

  it('falls back to the company currency when the code is blank (local currency)', () => {
    expect(getProjectCurrencyCode('', 'GBP')).toBe('GBP');
    expect(getProjectCurrencyCode('  ', 'GBP')).toBe('GBP');
  });

  it("falls back to the company currency when an older extension doesn't return it", () => {
    expect(getProjectCurrencyCode(undefined, 'GBP')).toBe('GBP');
    expect(getProjectCurrencyCode(null, 'USD')).toBe('USD');
  });

  it('normalises the code', () => {
    expect(getProjectCurrencyCode(' eur ', 'GBP')).toBe('EUR');
  });
});

describe('isForeignCurrency', () => {
  it('is true only when the project is priced in another currency', () => {
    expect(isForeignCurrency('EUR', 'GBP')).toBe(true);
    expect(isForeignCurrency('', 'GBP')).toBe(false);
    expect(isForeignCurrency(undefined, 'GBP')).toBe(false);
    expect(isForeignCurrency('GBP', 'GBP')).toBe(false);
  });
});

describe('planningLineCostLCY', () => {
  it('uses the LCY cost when the extension returns it', () => {
    expect(planningLineCostLCY(planningLine({ totalCost: 500, totalCostLCY: 430 }))).toBe(430);
  });

  it('uses a zero LCY cost rather than falling back', () => {
    expect(planningLineCostLCY(planningLine({ totalCost: 500, totalCostLCY: 0 }))).toBe(0);
  });

  it("falls back to totalCost on extensions that don't return it", () => {
    expect(planningLineCostLCY(planningLine({ totalCost: 500 }))).toBe(500);
  });
});

describe('timeEntryPriceProjectCurrency', () => {
  it('uses the project-currency price when the extension returns it', () => {
    expect(
      timeEntryPriceProjectCurrency(timeEntry({ totalPrice: 800, totalPriceProjectCurrency: 930 }))
    ).toBe(930);
  });

  it("falls back to totalPrice on extensions that don't return it", () => {
    expect(timeEntryPriceProjectCurrency(timeEntry({ totalPrice: 800 }))).toBe(800);
  });
});

describe('formatting', () => {
  it('formats amounts the UK way whatever the currency', () => {
    expect(formatCurrency(1234.5, 'GBP')).toBe('£1,234.50');
    expect(formatCurrency(28025, 'EUR')).toBe('€28,025.00');
    expect(formatCurrency(1200, 'USD')).toBe('US$1,200.00');
  });

  it('puts the symbol before the amount for EUR', () => {
    const formatted = formatCurrency(28025, 'EUR');
    expect(formatted.startsWith('€')).toBe(true);
    expect(formatted.endsWith('€')).toBe(false);
  });

  it("doesn't throw on a currency code Intl won't accept", () => {
    expect(formatCurrency(1234.5, 'EURO')).toBe('1,234.50 EURO');
  });

  it('gives the currency symbol', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('USD')).toBe('US$');
    expect(getCurrencySymbol('EURO')).toBe('EURO');
  });

  it('formats compact chart labels', () => {
    expect(formatCurrencyShort(950, 'GBP')).toBe('£950');
    expect(formatCurrencyShort(12500, 'EUR')).toBe('€12.5k');
    expect(formatCurrencyShort(950, 'EURO')).toBe('EURO 950');
  });
});
