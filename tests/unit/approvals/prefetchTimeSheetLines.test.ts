import { describe, it, expect, vi } from 'vitest';
import { prefetchTimeSheetLines } from '@/components/approvals/prefetchTimeSheetLines';
import type { BCTimeSheet, BCTimeSheetLine } from '@/types';

function sheet(n: number, status: 'approved' | 'submitted'): BCTimeSheet {
  return {
    id: `id-${n}`,
    number: `TS${String(n).padStart(5, '0')}`,
    resourceNo: 'R0001',
    startingDate: '2026-01-05',
    endingDate: '2026-01-11',
    openExists: false,
    submittedExists: status === 'submitted',
    rejectedExists: false,
    approvedExists: status === 'approved',
  };
}

function line(timeSheetNo: string, hours: number): BCTimeSheetLine {
  return {
    id: `${timeSheetNo}-line`,
    timeSheetNo,
    lineNo: 10000,
    type: 'Job',
    jobNo: 'PR00001',
    totalQuantity: hours,
    status: 'Submitted',
  };
}

describe('prefetchTimeSheetLines', () => {
  it('fetches each timesheet once with bounded concurrency, submitted first', async () => {
    // A long approved history followed by the newest submitted week (API order)
    const sheets = [...Array.from({ length: 40 }, (_, i) => sheet(i + 1, 'approved'))];
    sheets.push(sheet(41, 'submitted'));

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchLines = vi.fn(async (timeSheetNo: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return [line(timeSheetNo, 8)];
    });
    const cache: Record<string, BCTimeSheetLine[]> = {};

    await prefetchTimeSheetLines(sheets, fetchLines, (id, lines) => {
      cache[id] = lines;
    });

    expect(fetchLines).toHaveBeenCalledTimes(41);
    expect(fetchLines.mock.calls[0][0]).toBe('TS00041');
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(cache['id-41'][0].totalQuantity).toBe(8);
    expect(Object.keys(cache)).toHaveLength(41);
  });

  it('skips failures and stops reporting once cancelled', async () => {
    const sheets = [sheet(1, 'submitted'), sheet(2, 'submitted'), sheet(3, 'submitted')];
    let cancelled = false;
    const fetchLines = vi.fn(async (timeSheetNo: string) => {
      if (timeSheetNo === 'TS00001') throw new Error('BC API Error (429)');
      cancelled = true; // e.g. the company was switched mid-load
      return [line(timeSheetNo, 4)];
    });
    const onLines = vi.fn();

    await prefetchTimeSheetLines(sheets, fetchLines, onLines, () => cancelled, 1);

    expect(fetchLines).toHaveBeenCalledTimes(2);
    expect(onLines).not.toHaveBeenCalled();
  });
});
