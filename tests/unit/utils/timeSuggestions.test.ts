import { describe, it, expect } from 'vitest';
import type { BCTimeSuggestion, TimeEntry } from '@/types';
import {
  buildAcceptUpdate,
  buildDismissUpdate,
  canQuickAdd,
  groupSuggestionsByDay,
  hideDuplicateSuggestions,
  isDuplicateOfEntry,
  isSimilarHours,
  roundToQuarterHour,
  suggestionNotes,
} from '@/utils/timeSuggestions';

const suggestion = (overrides: Partial<BCTimeSuggestion> = {}): BCTimeSuggestion => ({
  id: 's1',
  entryNo: 1,
  resourceNo: 'R0001',
  date: '2026-10-06',
  quantity: 1,
  jobNo: 'JOB001',
  jobTaskNo: '100',
  description: 'Contoso weekly sync',
  source: 'Calendar',
  confidence: 'High',
  status: 'Pending',
  ...overrides,
});

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'line1_2026-10-06',
  projectId: 'JOB001',
  taskId: '100',
  userId: 'u1',
  date: '2026-10-06',
  hours: 1,
  notes: '',
  isBillable: true,
  isRunning: false,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('roundToQuarterHour', () => {
  it('rounds minute-precise calendar durations to the nearest 15 minutes', () => {
    expect(roundToQuarterHour(31 / 60)).toBe(0.5);
    expect(roundToQuarterHour(1.4)).toBe(1.5);
    expect(roundToQuarterHour(1.1)).toBe(1);
  });

  it('never rounds a short block down to nothing', () => {
    expect(roundToQuarterHour(0.05)).toBe(0.25);
  });
});

describe('isSimilarHours', () => {
  it('treats durations within 15 minutes as the same', () => {
    expect(isSimilarHours(1, 1.25)).toBe(true);
    expect(isSimilarHours(0.5, 0.52)).toBe(true);
    expect(isSimilarHours(1, 1.5)).toBe(false);
  });

  it('allows 15% on longer blocks', () => {
    expect(isSimilarHours(8, 7)).toBe(true);
    expect(isSimilarHours(8, 6)).toBe(false);
  });
});

describe('isDuplicateOfEntry', () => {
  it('matches the same date, project, task and similar hours', () => {
    expect(isDuplicateOfEntry(suggestion({ quantity: 0.52 }), entry({ hours: 0.5 }))).toBe(true);
  });

  it('does not match a different date', () => {
    expect(isDuplicateOfEntry(suggestion(), entry({ date: '2026-10-07' }))).toBe(false);
  });

  it('does not match very different hours', () => {
    expect(isDuplicateOfEntry(suggestion({ quantity: 3 }), entry({ hours: 1 }))).toBe(false);
  });

  it('does not match a different task on the same project', () => {
    expect(isDuplicateOfEntry(suggestion(), entry({ taskId: '200' }))).toBe(false);
  });

  it('matches any task on the project when the suggestion has no task', () => {
    expect(isDuplicateOfEntry(suggestion({ jobTaskNo: '' }), entry({ taskId: '200' }))).toBe(true);
  });

  it('matches on description when the suggestion has no project', () => {
    const s = suggestion({ jobNo: '', jobTaskNo: '' });
    expect(
      isDuplicateOfEntry(s, entry({ projectId: 'JOB009', notes: ' contoso weekly SYNC ' }))
    ).toBe(true);
    expect(isDuplicateOfEntry(s, entry({ projectId: 'JOB009', notes: 'Something else' }))).toBe(
      false
    );
  });

  it('does not treat two empty descriptions as a match', () => {
    const s = suggestion({ jobNo: '', description: '' });
    expect(isDuplicateOfEntry(s, entry({ projectId: 'JOB009', notes: '' }))).toBe(false);
  });
});

describe('hideDuplicateSuggestions', () => {
  it('keeps only suggestions that are not already in the week', () => {
    const logged = suggestion({ id: 'logged' });
    const fresh = suggestion({ id: 'fresh', date: '2026-10-08' });
    const result = hideDuplicateSuggestions([logged, fresh], [entry()]);
    expect(result.map((s) => s.id)).toEqual(['fresh']);
  });
});

describe('groupSuggestionsByDay', () => {
  it('groups by date, earliest first, keeping order within a day', () => {
    const groups = groupSuggestionsByDay([
      suggestion({ id: 'b', date: '2026-10-07' }),
      suggestion({ id: 'a1', date: '2026-10-05' }),
      suggestion({ id: 'c', date: '2026-10-07' }),
      suggestion({ id: 'a2', date: '2026-10-05' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-05', '2026-10-07']);
    expect(groups[0].suggestions.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(groups[1].suggestions.map((s) => s.id)).toEqual(['b', 'c']);
  });
});

describe('canQuickAdd', () => {
  it('needs a project and a task', () => {
    expect(canQuickAdd(suggestion(), false)).toBe(true);
    expect(canQuickAdd(suggestion({ jobNo: '' }), false)).toBe(false);
    expect(canQuickAdd(suggestion({ jobTaskNo: '' }), false)).toBe(false);
  });

  it('needs a description when comments are required', () => {
    expect(canQuickAdd(suggestion({ description: '  ' }), true)).toBe(false);
    expect(canQuickAdd(suggestion({ description: '  ' }), false)).toBe(true);
  });
});

describe('suggestionNotes', () => {
  it('trims to the 100-character BC description limit', () => {
    expect(suggestionNotes(suggestion({ description: 'x'.repeat(150) }))).toHaveLength(100);
    expect(suggestionNotes(suggestion({ description: '  Review  ' }))).toBe('Review');
  });
});

describe('status write-backs', () => {
  const now = new Date('2026-10-07T09:30:00Z');

  it('accept records the timesheet line the suggestion became', () => {
    expect(buildAcceptUpdate('TS0001', 20000, now)).toEqual({
      status: 'Accepted',
      timeSheetNo: 'TS0001',
      timeSheetLineNo: 20000,
      actionedAt: '2026-10-07T09:30:00.000Z',
    });
  });

  it('accept leaves the line number out when it is unknown', () => {
    expect(buildAcceptUpdate('TS0001', null, now)).not.toHaveProperty('timeSheetLineNo');
  });

  it('dismiss stamps when it happened', () => {
    expect(buildDismissUpdate(now)).toEqual({
      status: 'Dismissed',
      actionedAt: '2026-10-07T09:30:00.000Z',
    });
  });
});
