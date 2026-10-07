import type { BCJobPlanningLine, BCTimeEntry } from '@/types';

// A project (BC Job) can be priced in a currency other than the company's: its "Currency
// Code". BC keeps each amount in that project currency and in the company's local currency
// (LCY). Thyme shows customer prices (Billable Price, Invoiced Price, the Spend vs Budget
// chart) in the project currency and internal costs (Budget Cost, Actual Cost) in LCY, so
// every figure sums amounts of a single currency.
//
// Thyme BC Extension 1.14.0.0 added the fields this needs. Older versions don't return them,
// so each helper falls back to what those versions return, which is what Thyme showed before.

/**
 * The currency of a project's prices: its BC Currency Code, or the company currency when
 * that's blank (BC's "local currency") or not returned (Thyme BC Extension before 1.14.0.0).
 */
export function getProjectCurrencyCode(
  projectCurrencyCode: string | null | undefined,
  companyCurrencyCode: string
): string {
  const code = projectCurrencyCode?.trim();
  return code ? code.toUpperCase() : companyCurrencyCode;
}

/** Whether a project's prices are in a currency other than the company's */
export function isForeignCurrency(
  projectCurrencyCode: string | null | undefined,
  companyCurrencyCode: string
): boolean {
  return (
    getProjectCurrencyCode(projectCurrencyCode, companyCurrencyCode) !==
    companyCurrencyCode.toUpperCase()
  );
}

/**
 * A planning line's total cost in LCY, for the internal Budget Cost. The line's own
 * totalCost is in the project currency; before 1.14.0.0 it's the only cost there is.
 */
export function planningLineCostLCY(line: BCJobPlanningLine): number {
  return typeof line.totalCostLCY === 'number' ? line.totalCostLCY : line.totalCost;
}

/**
 * A posted entry's total price in the project currency, for the Invoiced Price. The entry's
 * own totalPrice is in LCY; before 1.14.0.0 it's the only price there is.
 */
export function timeEntryPriceProjectCurrency(entry: BCTimeEntry): number {
  return typeof entry.totalPriceProjectCurrency === 'number'
    ? entry.totalPriceProjectCurrency
    : entry.totalPrice;
}

/**
 * Format an amount in a currency, always the UK way with the symbol first, e.g. £1,234.56,
 * €1,234.56 or US$1,234.56, so every amount on a page reads the same whatever its currency.
 * BC currency codes are user-defined, so a code Intl doesn't accept is shown as
 * "1,234.56 CODE" instead of throwing.
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const number = new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${number} ${currencyCode}`;
  }
}

/** The currency's symbol, e.g. £, €, US$ or CA$; the code itself when Intl has no symbol */
export function getCurrencySymbol(currencyCode: string): string {
  try {
    const part = new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

/** Compact amount for chart labels, e.g. £950, €12.5k */
export function formatCurrencyShort(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  // A symbol made of letters (an unknown code) reads better with a space: "XYZ 950"
  const prefix = /[A-Za-z]$/.test(symbol) ? `${symbol} ` : symbol;
  if (amount >= 1000) {
    return `${prefix}${(amount / 1000).toFixed(1)}k`;
  }
  return `${prefix}${amount.toFixed(0)}`;
}
