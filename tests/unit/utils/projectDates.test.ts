import { describe, it, expect } from 'vitest';
import { describeEndDatePassed, describeProjectDates, parseBCDate } from '@/utils/projectDates';

const today = new Date(2026, 5, 15); // 15 Jun 2026, local

describe('parseBCDate', () => {
  it('parses YYYY-MM-DD as a local date', () => {
    const d = parseBCDate('2026-04-01');
    expect(d).toEqual(new Date(2026, 3, 1));
    expect(d?.getDate()).toBe(1);
  });

  it('returns null for empty, sentinel and invalid values', () => {
    expect(parseBCDate(undefined)).toBeNull();
    expect(parseBCDate('')).toBeNull();
    expect(parseBCDate('0001-01-01')).toBeNull();
    expect(parseBCDate('not-a-date')).toBeNull();
    expect(parseBCDate('2026-02-31')).toBeNull();
    expect(parseBCDate('2026-06-15junk')).toBeNull();
    expect(parseBCDate('2026-06-15T00:00:00Z')).toEqual(new Date(2026, 5, 15));
  });
});

describe('describeProjectDates', () => {
  it('formats both dates en-GB short month', () => {
    const r = describeProjectDates('2026-04-01', '2027-03-31', true, today);
    expect(r).toEqual({ start: '1 Apr 2026', end: '31 Mar 2027', endUrgency: 'none' });
  });

  it('handles a missing start date', () => {
    const r = describeProjectDates('0001-01-01', '2027-03-31', true, today);
    expect(r.start).toBe('No start date');
    expect(r.end).toBe('31 Mar 2027');
  });

  it('handles a missing end date', () => {
    const r = describeProjectDates('2026-04-01', '0001-01-01', true, today);
    expect(r.start).toBe('1 Apr 2026');
    expect(r.end).toBe('No end date');
    expect(r.endUrgency).toBe('none');
  });

  it('shows nothing when neither date is set', () => {
    expect(describeProjectDates('0001-01-01', undefined, true, today)).toEqual({
      start: null,
      end: null,
      endUrgency: 'none',
    });
  });

  it('flags an end date within 30 days as soon, including the boundaries', () => {
    expect(describeProjectDates(undefined, '2026-06-15', true, today).endUrgency).toBe('soon');
    expect(describeProjectDates(undefined, '2026-07-15', true, today).endUrgency).toBe('soon');
    expect(describeProjectDates(undefined, '2026-07-16', true, today).endUrgency).toBe('none');
  });

  it('flags a past end date as overdue', () => {
    expect(describeProjectDates(undefined, '2026-06-14', true, today).endUrgency).toBe('overdue');
  });

  it('says how long ago a passed end date was, so red is not the only cue', () => {
    expect(describeProjectDates(undefined, '2026-06-14', true, today).endHint).toBe(
      'Ended 1 day ago'
    );
    expect(describeProjectDates(undefined, '2026-06-15', true, today).endHint).toBeUndefined();
  });

  it('does not flag inactive projects', () => {
    expect(describeProjectDates(undefined, '2026-06-14', false, today).endUrgency).toBe('none');
    expect(describeProjectDates(undefined, '2026-06-20', false, today).endUrgency).toBe('none');
  });

  it('is unaffected by the time of day', () => {
    const lateToday = new Date(2026, 5, 15, 23, 59);
    expect(describeProjectDates(undefined, '2026-06-15', true, lateToday).endUrgency).toBe('soon');
  });
});

describe('describeEndDatePassed', () => {
  it('describes an end date before today', () => {
    expect(describeEndDatePassed('2026-06-14', true, today)).toBe('Ended 1 day ago');
    expect(describeEndDatePassed('2026-06-05', true, today)).toBe('Ended 10 days ago');
  });

  it('does not count today, or a future date, as past', () => {
    expect(describeEndDatePassed('2026-06-15', true, today)).toBeNull();
    expect(describeEndDatePassed('2026-06-16', true, today)).toBeNull();
    // Late in the day is still today
    expect(describeEndDatePassed('2026-06-15', true, new Date(2026, 5, 15, 23, 59))).toBeNull();
  });

  it('skips empty and placeholder dates', () => {
    expect(describeEndDatePassed(undefined, true, today)).toBeNull();
    expect(describeEndDatePassed('', true, today)).toBeNull();
    expect(describeEndDatePassed('0001-01-01', true, today)).toBeNull();
  });

  it('does not flag projects that are no longer active', () => {
    expect(describeEndDatePassed('2026-06-14', false, today)).toBeNull();
  });
});
