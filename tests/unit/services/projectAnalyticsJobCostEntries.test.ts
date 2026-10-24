import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BCTimeEntry } from '@/types';

// AI agents are BC resources with a unit price only: their hours are what's charged. Their real
// cost (AI tokens, compute) is posted to the project against the AI-USAGE Machine resource
// (unit of measure in currency units, unit cost 1, unit price 0), so its quantity is money
const client = vi.hoisted(() => ({
  isExtensionInstalled: vi.fn(async () => true),
  getResources: vi.fn(),
  getTimeSheetsFrom: vi.fn(),
  getTimeSheetLinesForJob: vi.fn(),
  getTimeSheetDetailsForJob: vi.fn(),
  getJobPlanningLines: vi.fn(async () => []),
  getResourceUnitsOfMeasure: vi.fn(async () => []),
  getJobCostEntries: vi.fn(),
  getTimeEntries: vi.fn(),
  getJobTasks: vi.fn(async () => []),
}));
vi.mock('@/services/bc/bcClient', () => ({ bcClient: client }));

import { projectDetailsService, summarizePostedEntries } from '@/services/bc/projectDetailsService';

const entry = (overrides: Partial<BCTimeEntry>): BCTimeEntry => ({
  id: 'e1',
  jobNo: 'PR00010',
  jobTaskNo: '100',
  type: 'Resource',
  number: 'R0010',
  quantity: 8,
  totalCost: 400,
  totalPrice: 800,
  totalPriceProjectCurrency: 800,
  postingDate: '2026-10-05',
  ...overrides,
});

// 8 hours by an AI agent: charged at its unit price, at no resource cost
const agentHours = entry({
  number: 'AGENT1',
  resourceType: 'Person',
  totalCost: 0,
  totalPrice: 960,
  totalPriceProjectCurrency: 960,
});
// Its AI usage: £37.50 posted against the AI-USAGE Machine resource, quantity 37.50
const aiUsage = entry({
  id: 'e2',
  number: 'AI-USAGE',
  resourceType: 'Machine',
  description: 'AI usage',
  quantity: 37.5,
  totalCost: 37.5,
  totalPrice: 0,
  totalPriceProjectCurrency: 0,
});
// A non-chargeable G/L line, quantity 1
const glCost = entry({
  id: 'e3',
  type: 'G/L Account',
  number: '6100',
  resourceType: '',
  quantity: 1,
  totalCost: 12,
  totalPrice: 0,
  totalPriceProjectCurrency: 0,
});

describe('summarizePostedEntries', () => {
  it('counts an AI-USAGE entry of quantity 37.50 as £37.50 of AI cost and 0 hours', () => {
    const totals = summarizePostedEntries([agentHours, aiUsage], { allTypes: true });

    expect(totals.hoursPosted).toBe(8); // the agent's 8, not 45.5
    expect(totals.actualCost).toBe(37.5);
    expect(totals.actualCostBreakdown).toEqual({
      resource: 0,
      ai: 37.5,
      item: 0,
      glAccount: 0,
      total: 37.5,
    });
    expect(totals.invoicedPrice).toBe(960);
    expect(totals.invoicedPriceBreakdown.resource).toBe(960);
    expect(totals.invoicedPriceLCY).toBe(960);
  });

  it('counts any Machine resource as AI, and a configured AI resource even without its type', () => {
    const machine = entry({ number: 'GPU-1', resourceType: 'Machine', quantity: 3, totalCost: 3 });
    const { resourceType: _rt, ...untypedAi } = aiUsage;
    const totals = summarizePostedEntries([machine, untypedAi as BCTimeEntry], {
      allTypes: true,
    });
    expect(totals.hoursPosted).toBe(0);
    expect(totals.actualCostBreakdown.ai).toBe(40.5);
  });

  it('counts a G/L entry with quantity 1 as cost, never as hours', () => {
    const totals = summarizePostedEntries([entry({}), glCost], { allTypes: true });
    expect(totals.hoursPosted).toBe(8);
    expect(totals.actualCostBreakdown.glAccount).toBe(12);
    expect(totals.actualCost).toBe(412);
  });

  it('tells AI-USAGE apart on timeEntries too (extension before 1.28), by its number', () => {
    const { resourceType: _rt, ...untypedAi } = aiUsage;
    const totals = summarizePostedEntries([entry({}), untypedAi as BCTimeEntry], {
      allTypes: false,
    });
    expect(totals.hoursPosted).toBe(8);
    expect(totals.actualCostBreakdown).toEqual({
      resource: 400,
      ai: 37.5,
      item: 0,
      glAccount: 0,
      total: 437.5,
    });
  });

  it('never counts Item quantities as hours either', () => {
    const totals = summarizePostedEntries(
      [entry({}), entry({ id: 'e3', type: 'Item', quantity: 5, totalCost: 50, totalPrice: 70 })],
      { allTypes: true }
    );
    expect(totals.hoursPosted).toBe(8);
    expect(totals.actualCostBreakdown.item).toBe(50);
    expect(totals.actualCost).toBe(450);
  });

  it('treats timeEntries (Resource only, before extension 1.28) as Resource, even without a type', () => {
    const { type: _type, ...untyped } = entry({});
    const totals = summarizePostedEntries([untyped as BCTimeEntry], { allTypes: false });
    expect(totals.hoursPosted).toBe(8);
    expect(totals.actualCostBreakdown.resource).toBe(400);
  });

  it('keeps LCY and project-currency prices apart', () => {
    const totals = summarizePostedEntries(
      [entry({ currencyCode: 'EUR', totalPrice: 830, totalPriceProjectCurrency: 960 })],
      { allTypes: true }
    );
    expect(totals.invoicedPrice).toBe(960); // EUR
    expect(totals.invoicedPriceLCY).toBe(830); // GBP, for the margin
  });
});

describe('project analytics from jobCostEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 10 hours on timesheets, of which 8 are posted
    client.getResources.mockResolvedValue([{ number: 'R0010', name: 'Contoso Person' }]);
    client.getTimeSheetsFrom.mockResolvedValue([{ number: 'TS001', resourceNo: 'R0010' }]);
    client.getTimeSheetLinesForJob.mockResolvedValue([
      {
        timeSheetNo: 'TS001',
        lineNo: 10000,
        type: 'Job',
        jobNo: 'PR00010',
        jobTaskNo: '100',
        totalQuantity: 10,
        status: 'Approved',
        chargeable: true,
      },
    ]);
    client.getTimeSheetDetailsForJob.mockResolvedValue([
      { timeSheetNo: 'TS001', timeSheetLineNo: 10000, date: '2026-10-05', quantity: 10 },
    ]);
  });

  it("includes AI and G/L costs in Actual Cost, but only people's time in posted hours", async () => {
    client.getJobCostEntries.mockResolvedValue([
      entry({ resourceType: 'Person' }),
      aiUsage,
      glCost,
    ]);

    const a = await projectDetailsService.getProjectAnalytics('PR00010');

    expect(client.getTimeEntries).not.toHaveBeenCalled();
    expect(a.hoursPosted).toBe(8);
    expect(a.actualCost).toBe(449.5);
    expect(a.actualCostBreakdown).toEqual({
      resource: 400,
      ai: 37.5,
      item: 0,
      glAccount: 12,
      total: 449.5,
    });
    expect(a.invoicedPrice).toBe(800);
    expect(a.invoicedPriceLCY).toBe(800);
    // The 2 unposted hours are valued at the Resource rate (£50/h), not inflated by AI or G/L cost
    expect(a.hoursUnposted).toBe(2);
    expect(a.unpostedCost).toBe(100);
    expect(a.unpostedBillable).toBe(200);
  });

  it('marks the costs incomplete, without falling back, when jobCostEntries fails (500)', async () => {
    client.getJobCostEntries.mockRejectedValue(new Error('BC API Error (500): Internal error'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const a = await projectDetailsService.getProjectAnalytics('PR00010');

    expect(client.getTimeEntries).not.toHaveBeenCalled();
    expect(a.costsIncomplete).toBe(true);
    expect(a.actualCost).toBe(0);
    expect(a.invoicedPriceLCY).toBe(0);
    expect(a.hoursSpent).toBe(10); // timesheet hours still load
    error.mockRestore();
  });

  it('falls back to timeEntries when jobCostEntries is missing (extension not updated)', async () => {
    client.getJobCostEntries.mockResolvedValue(null);
    client.getTimeEntries.mockResolvedValue([entry({})]);

    const a = await projectDetailsService.getProjectAnalytics('PR00010');

    expect(client.getTimeEntries).toHaveBeenCalledWith('PR00010');
    expect(a.costsIncomplete).toBe(false);
    expect(a.hoursPosted).toBe(8);
    expect(a.actualCost).toBe(400);
    expect(a.actualCostBreakdown).toEqual({
      resource: 400,
      ai: 0,
      item: 0,
      glAccount: 0,
      total: 400,
    });
    expect(a.invoicedPrice).toBe(800);
    expect(a.invoicedPriceBreakdown.resource).toBe(800);
  });
});
