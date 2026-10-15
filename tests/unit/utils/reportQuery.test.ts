import { describe, it, expect } from 'vitest';
import { buildReportQuery, parseReportQuery, withReportQuery } from '@/utils/reportQuery';
import { customPeriod, getPresetPeriod, periodOf } from '@/utils/reportPeriod';
import { NO_REPORT_FILTER } from '@/utils/reportFilters';

const today = new Date(2026, 9, 15);
const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('parseReportQuery', () => {
  it("is this week's summary for everyone with no query", () => {
    const query = parseReportQuery('', today);
    expect(query.view).toBe('summary');
    expect(query.period).toEqual(getPresetPeriod('thisWeek', today));
    expect(query.filter).toEqual(NO_REPORT_FILTER);
    expect(query.resourceNos).toEqual([]);
  });

  it('reads the view, period and every filter', () => {
    const query = parseReportQuery(
      '?view=entries&from=2026-04-01&to=2026-10-15&client=customer:C10000,internal&project=pr00100&task=1000,2000&resource=R0070&stage=approved,posted',
      today
    );
    expect(query.view).toBe('entries');
    expect(query.period.unit).toBe('custom');
    expect(day(query.period.from)).toEqual([2026, 4, 1]);
    expect(day(query.period.to)).toEqual([2026, 10, 15]);
    expect(query.filter).toEqual({
      clientIds: ['customer:C10000', 'internal'],
      projectNos: ['PR00100'],
      taskNos: ['1000', '2000'],
      stages: ['approved', 'posted'],
    });
    expect(query.resourceNos).toEqual(['R0070']);
  });

  it('keeps a whole month as a month, so the arrows step by month', () => {
    const query = parseReportQuery('?from=2026-09-01&to=2026-09-30&unit=month', today);
    expect(query.period).toEqual(periodOf('month', new Date(2026, 8, 1)));
    // Dates that aren't the whole month: a custom range
    expect(parseReportQuery('?from=2026-09-02&to=2026-09-30&unit=month', today).period.unit).toBe(
      'custom'
    );
  });

  it('falls back to this week for a period longer than ten years', () => {
    expect(parseReportQuery('?from=1926-01-01&to=2026-10-15', today).period).toEqual(
      getPresetPeriod('thisWeek', today)
    );
    // Nine years: a long-lived project's whole life
    expect(parseReportQuery('?from=2017-10-15&to=2026-10-15', today).period.unit).toBe('custom');
  });

  it("ignores what it can't read", () => {
    const query = parseReportQuery('?view=nope&from=2026-13-45&stage=done,approved&task=', today);
    expect(query.view).toBe('summary');
    expect(query.period).toEqual(getPresetPeriod('thisWeek', today));
    expect(query.filter.stages).toEqual(['approved']);
    expect(query.filter.taskNos).toEqual([]);
  });
});

describe('buildReportQuery', () => {
  it('round-trips through parseReportQuery', () => {
    const query = {
      view: 'entries' as const,
      period: customPeriod(new Date(2026, 3, 1), new Date(2026, 9, 15)),
      filter: {
        clientIds: ['customer:C10000'],
        projectNos: ['PR00100'],
        taskNos: ['1000'],
        stages: ['submitted' as const],
      },
      resourceNos: ['R0070'],
    };
    const text = buildReportQuery(query);
    expect(text).toBe(
      'view=entries&from=2026-04-01&to=2026-10-15&client=customer:C10000&project=PR00100&task=1000&resource=R0070&stage=submitted'
    );
    expect(parseReportQuery(text, today)).toEqual(query);
  });

  it('leaves out everything not picked', () => {
    expect(buildReportQuery({})).toBe('');
    expect(buildReportQuery({ view: 'summary', filter: NO_REPORT_FILTER })).toBe('');
  });
});

describe('withReportQuery', () => {
  it("replaces the page's parameters and keeps any others", () => {
    expect(withReportQuery('?utm=mail&project=OLD&stage=posted', { view: 'entries' })).toBe(
      '?view=entries&utm=mail'
    );
    expect(withReportQuery('?project=OLD', {})).toBe('');
  });
});
