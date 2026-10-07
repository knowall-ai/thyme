import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCJobPlanningLine, BCTimeEntry } from '@/types';

// A project priced in EUR in a GBP company: BC keeps each amount in both currencies
const client = vi.hoisted(() => ({
  isExtensionInstalled: vi.fn(async () => true),
  getResources: vi.fn(),
  getTimeSheetsFrom: vi.fn(),
  getTimeSheetLinesForJob: vi.fn(),
  getTimeSheetDetailsForJob: vi.fn(),
  getJobPlanningLines: vi.fn(),
  getResourceUnitsOfMeasure: vi.fn(async () => []),
  getTimeEntries: vi.fn(),
  getJobTasks: vi.fn(async () => []),
}));
vi.mock('@/services/bc/bcClient', () => ({ bcClient: client }));

import { projectDetailsService } from '@/services/bc/projectDetailsService';

const line = (overrides: Partial<BCJobPlanningLine>): BCJobPlanningLine => ({
  id: 'l1',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  lineNo: 10000,
  planningDate: '2026-10-05',
  lineType: 'Both Budget and Billable',
  type: 'Resource',
  number: 'R0010',
  description: 'Contoso design work',
  quantity: 10,
  unitCost: 60, // EUR
  unitPrice: 120, // EUR
  totalCost: 600, // EUR
  totalPrice: 1200, // EUR
  lastModifiedDateTime: '2026-10-05T00:00:00Z',
  ...overrides,
});

const entry = (overrides: Partial<BCTimeEntry>): BCTimeEntry => ({
  id: 'e1',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  resourceNo: 'R0010',
  quantity: 8,
  totalCost: 400, // GBP
  totalPrice: 830, // GBP
  postingDate: '2026-10-05',
  ...overrides,
});

// Fields Thyme BC Extension 1.14.0.0 adds
const newFields = {
  line: { currencyCode: 'EUR', totalCostLCY: 520, totalPriceLCY: 1040 },
  entry: { currencyCode: 'EUR', totalPriceProjectCurrency: 960 },
};

beforeEach(() => {
  vi.clearAllMocks();
  // One person with a GBP selling rate on their Resource Card, 8 hours on the project
  client.getResources.mockResolvedValue([
    { number: 'R0010', name: 'Contoso Person', unitPrice: 100 },
  ]);
  client.getTimeSheetsFrom.mockResolvedValue([{ number: 'TS001', resourceNo: 'R0010' }]);
  client.getTimeSheetLinesForJob.mockResolvedValue([
    {
      timeSheetNo: 'TS001',
      lineNo: 10000,
      type: 'Job',
      jobNo: 'PR00010',
      jobTaskNo: '100',
      totalQuantity: 8,
      status: 'Approved',
      chargeable: true,
    },
  ]);
  client.getTimeSheetDetailsForJob.mockResolvedValue([
    { timeSheetNo: 'TS001', timeSheetLineNo: 10000, date: '2026-10-05', quantity: 8 },
  ]);
});

describe('project analytics currencies', () => {
  it('sums costs in LCY and prices in the project currency (extension 1.14.0.0+)', async () => {
    client.getJobPlanningLines.mockResolvedValue([line(newFields.line)]);
    client.getTimeEntries.mockResolvedValue([entry(newFields.entry)]);

    const a = await projectDetailsService.getProjectAnalytics('PR00010', false, {
      foreignCurrency: true,
    });

    expect(a.budgetCost).toBe(520); // LCY
    expect(a.budgetCostBreakdown.resource).toBe(520);
    expect(a.actualCost).toBe(400); // LCY
    expect(a.billablePrice).toBe(1200); // EUR
    expect(a.invoicedPrice).toBe(960); // EUR
    expect(a.invoicedPriceBreakdown.total).toBe(960);
  });

  it("falls back to the older fields when the extension doesn't return the new ones", async () => {
    client.getJobPlanningLines.mockResolvedValue([line({})]);
    client.getTimeEntries.mockResolvedValue([entry({})]);

    const a = await projectDetailsService.getProjectAnalytics('PR00010');

    expect(a.budgetCost).toBe(600);
    expect(a.actualCost).toBe(400);
    expect(a.billablePrice).toBe(1200);
    expect(a.invoicedPrice).toBe(830);
  });

  it("doesn't use Resource Card prices (company currency) for a foreign-currency project", async () => {
    client.getJobPlanningLines.mockResolvedValue([line(newFields.line)]);
    client.getTimeEntries.mockResolvedValue([entry(newFields.entry)]);

    const foreign = await projectDetailsService.getProjectAnalytics('PR00010', false, {
      foreignCurrency: true,
    });
    expect(foreign.teamBreakdown[0].unitPrice).toBe(120); // the planning line's EUR price

    const local = await projectDetailsService.getProjectAnalytics('PR00010');
    expect(local.teamBreakdown[0].unitPrice).toBe(100); // the Resource Card's price
  });
});
