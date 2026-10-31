import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET as getConfig } from '@/app/api/config/route';
import type { BCJobPlanningLine, BCTimeSheetDetail, BCTimeSheetLine } from '@/types';
import {
  getAiResourceNos,
  loadAiResources,
  setAiResources,
  isAiResource,
  sumPlannedHours,
  sumEstimateHours,
  collectProjectTimeRows,
} from '@/utils';

describe('AI usage resources', () => {
  it('defaults to AI-USAGE, and reads a comma-separated TIMMIE_AI_RESOURCES', () => {
    expect([...getAiResourceNos(undefined)]).toEqual(['AI-USAGE']);
    expect([...getAiResourceNos('')]).toEqual(['AI-USAGE']);
    expect([...getAiResourceNos('   ')]).toEqual(['AI-USAGE']);
    expect([...getAiResourceNos(' , ,')]).toEqual(['AI-USAGE']);
    expect([...getAiResourceNos(' ai-usage, gpu-hours ,')]).toEqual(['AI-USAGE', 'GPU-HOURS']);
  });

  it('treats Machine resources and configured numbers as AI, and people as not', () => {
    expect(isAiResource('AI-USAGE')).toBe(true);
    expect(isAiResource('ai-usage')).toBe(true);
    expect(isAiResource('GPU-1', 'Machine')).toBe(true);
    expect(isAiResource('R0010', 'Person')).toBe(false);
    expect(isAiResource('R0010')).toBe(false);
    expect(isAiResource(undefined)).toBe(false);
  });
});

describe('hours never include AI usage resources', () => {
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
    unitCost: 50,
    unitPrice: 100,
    totalCost: 500,
    totalPrice: 1000,
    lastModifiedDateTime: '2026-10-05T00:00:00Z',
    ...overrides,
  });
  const lines = [line({}), line({ id: 'l2', number: 'AI-USAGE', quantity: 37.5 })];

  it('leaves AI-USAGE planning lines out of Planned and Estimate hours', () => {
    expect(sumPlannedHours(lines, new Map())).toBe(10);
    expect(sumEstimateHours(lines, new Map())).toBe(10);
  });

  it("leaves an AI resource's timesheet time out of Time Spent", () => {
    const tsLines = [
      { timeSheetNo: 'TS1', lineNo: 1, type: 'Job', jobNo: 'PR00010', totalQuantity: 8 },
      { timeSheetNo: 'TS2', lineNo: 1, type: 'Job', jobNo: 'PR00010', totalQuantity: 5 },
    ] as BCTimeSheetLine[];
    const details = [
      { timeSheetNo: 'TS1', timeSheetLineNo: 1, date: '2026-10-05', quantity: 8 },
      { timeSheetNo: 'TS2', timeSheetLineNo: 1, date: '2026-10-05', quantity: 5 },
    ] as BCTimeSheetDetail[];
    const rows = collectProjectTimeRows(
      tsLines,
      details,
      new Map([
        ['TS1', 'R0010'],
        ['TS2', 'AI-USAGE'],
      ]),
      new Set(['R0010', 'AI-USAGE'])
    );
    expect(rows.map((r) => r.resourceNo)).toEqual(['R0010']);
  });
});

describe('TIMMIE_AI_RESOURCES at runtime', () => {
  afterEach(() => {
    setAiResources(undefined);
    vi.unstubAllEnvs();
  });

  it('is served by /api/config from the server environment, read on each request', async () => {
    vi.stubEnv('TIMMIE_AI_RESOURCES', 'AI-USAGE,GPU-HOURS');
    await expect((await getConfig()).json()).resolves.toEqual({
      aiResources: 'AI-USAGE,GPU-HOURS',
    });
    vi.stubEnv('TIMMIE_AI_RESOURCES', 'TOKENS');
    await expect((await getConfig()).json()).resolves.toEqual({ aiResources: 'TOKENS' });
  });

  it('is loaded once by the client and then used to classify resources', async () => {
    setAiResources(undefined);
    const fetcher = vi.fn(async () => Response.json({ aiResources: 'GPU-HOURS' }));
    await Promise.all([loadAiResources(fetcher), loadAiResources(fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(isAiResource('GPU-HOURS')).toBe(true);
    expect(isAiResource('AI-USAGE')).toBe(false);
  });

  it('keeps the default (AI-USAGE) when the server has none or /api/config fails', async () => {
    setAiResources(undefined);
    await loadAiResources(vi.fn(async () => Response.json({ aiResources: '' })));
    expect(isAiResource('AI-USAGE')).toBe(true);

    setAiResources(undefined);
    await loadAiResources(vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(isAiResource('AI-USAGE')).toBe(true);
  });
});
