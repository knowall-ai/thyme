import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getTimeSheets = vi.fn();
const getTimeSheetLines = vi.fn();
const getAllTimeSheetDetails = vi.fn();
const getProjects = vi.fn();

vi.mock('@/services/bc/bcClient', () => ({
  bcClient: {
    environment: 'Sandbox',
    companyId: 'company-1',
    getTimeSheets: (...args: unknown[]) => getTimeSheets(...args),
    getTimeSheetLines: (...args: unknown[]) => getTimeSheetLines(...args),
    getAllTimeSheetDetails: (...args: unknown[]) => getAllTimeSheetDetails(...args),
    getProjects: (...args: unknown[]) => getProjects(...args),
  },
}));

import { timeEntryService } from '@/services/bc/timeEntryService';
import type { Teammate } from '@/types';

const teammate = { id: 'user-1', resourceNo: 'R001' } as Teammate;
const week = new Date('2026-10-05T00:00:00');

const line = (lineNo: number, jobNo: string, chargeable?: boolean) => ({
  id: `line-${lineNo}`,
  timeSheetNo: 'TS001',
  lineNo,
  type: 'Job',
  jobNo,
  jobTaskNo: '100',
  totalQuantity: 2,
  status: 'Open',
  chargeable,
});

const detail = (lineNo: number) => ({
  id: `detail-${lineNo}`,
  timeSheetNo: 'TS001',
  timeSheetLineNo: lineNo,
  date: '2026-10-05',
  quantity: 2,
});

// Each test starts well past the projects cache's lifetime, so it fetches afresh
let clock = new Date('2026-10-05T09:00:00').getTime();

describe('timeEntryService billable time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    clock += 60 * 60 * 1000;
    vi.setSystemTime(clock);
    getTimeSheets.mockResolvedValue([{ id: 'ts-1', number: 'TS001' }]);
    getProjects.mockResolvedValue([
      {
        id: 'p1',
        number: 'CUST',
        displayName: 'Customer work',
        billToCustomerNo: 'C1',
        billToCustomerName: 'Contoso Ltd',
      },
      {
        id: 'p2',
        number: 'INT',
        displayName: 'Internal work',
        billToCustomerNo: 'C9',
        billToCustomerName: 'Contoso - Internal',
      },
      { id: 'p3', number: 'NOBILL', displayName: 'Admin' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only marks chargeable time on customer projects as billable', async () => {
    getTimeSheetLines.mockResolvedValue([
      line(1, 'CUST', true),
      line(2, 'INT', true),
      line(3, 'NOBILL', true),
      line(4, 'CUST', false),
      line(5, 'UNKNOWN', true),
    ]);
    getAllTimeSheetDetails.mockResolvedValue([1, 2, 3, 4, 5].map(detail));

    const entries = await timeEntryService.getTeammateEntries(week, teammate);

    expect(entries.map((e) => [e.projectId, e.isBillable])).toEqual([
      ['CUST', true],
      ['INT', false],
      ['NOBILL', false],
      ['CUST', false],
      ['UNKNOWN', true], // project not known: judged on the line alone
    ]);
  });

  it('reuses one projects request across timesheets', async () => {
    getTimeSheetLines.mockResolvedValue([line(1, 'CUST', true)]);
    getAllTimeSheetDetails.mockResolvedValue([detail(1)]);

    await timeEntryService.getTeammateEntries(week, teammate);
    await timeEntryService.getTeammateEntries(week, { ...teammate, resourceNo: 'R002' });

    expect(getProjects).toHaveBeenCalledTimes(1);
  });

  it('still loads entries, judged on the line alone, when projects fail to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getProjects.mockRejectedValue(new Error('BC unavailable'));
    getTimeSheetLines.mockResolvedValue([line(1, 'INT', true), line(2, 'CUST', false)]);
    getAllTimeSheetDetails.mockResolvedValue([detail(1), detail(2)]);

    const entries = await timeEntryService.getTeammateEntries(week, teammate);

    expect(entries.map((e) => e.isBillable)).toEqual([true, false]);
    warn.mockRestore();
  });
});
