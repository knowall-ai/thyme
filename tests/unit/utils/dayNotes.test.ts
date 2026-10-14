import { describe, it, expect } from 'vitest';
import type { BCDayNote } from '@/types';
import {
  buildDayNotesIndex,
  canEditPlan,
  formatDayNotesTitle,
  getNoProjectWorkReason,
  getNotesForDate,
  isDayNoteConflict,
  normalizeDayNote,
  validateDayNoteInput,
} from '@/utils/dayNotes';

const note = (partial: Partial<BCDayNote>): BCDayNote => ({
  id: `n${partial.entryNo ?? 1}`,
  entryNo: 1,
  noteDate: '2026-10-14',
  resourceNo: '',
  note: 'Company Off-Site',
  noProjectWork: false,
  ...partial,
});

describe('day notes', () => {
  const notes = [
    note({ entryNo: 2, resourceNo: 'R002', note: 'Dentist', noProjectWork: true }),
    note({ entryNo: 1, note: 'Company Off-Site', noProjectWork: true }),
    note({ entryNo: 3, note: 'Release day' }),
    note({ entryNo: 4, noteDate: '2026-10-15', resourceNo: 'R001', note: 'Client workshop' }),
  ];
  const index = buildDayNotesIndex(notes);

  it('groups notes by date into company-wide and per person', () => {
    expect(index.get('2026-10-14')?.company.map((n) => n.note)).toEqual([
      'Company Off-Site',
      'Release day',
    ]);
    expect(
      index
        .get('2026-10-14')
        ?.byResource.get('R002')
        ?.map((n) => n.note)
    ).toEqual(['Dentist']);
    expect(getNotesForDate(index, '2026-10-14').map((n) => n.entryNo)).toEqual([1, 3, 2]);
    expect(getNotesForDate(index, '2026-10-20')).toEqual([]);
  });

  it('says why a day has no project work, for everyone or one person', () => {
    expect(getNoProjectWorkReason(index, '2026-10-14')).toBe('Company Off-Site');
    expect(getNoProjectWorkReason(index, '2026-10-14', 'R002')).toBe('Company Off-Site; Dentist');
    // A note without "no project work" doesn't take the day away
    expect(getNoProjectWorkReason(index, '2026-10-15', 'R001')).toBeUndefined();
  });

  it('describes one note, or a count and a line each', () => {
    expect(formatDayNotesTitle([notes[1]])).toBe('Company Off-Site (no project work)');
    expect(formatDayNotesTitle([notes[1], notes[0]], () => 'Sam Contoso')).toBe(
      '2 notes\n  Company Off-Site (no project work)\n  Sam Contoso: Dentist (no project work)'
    );
  });

  it('normalises a record off the wire', () => {
    expect(
      normalizeDayNote({ id: 'x', noteDate: '2026-10-14T00:00:00Z', resourceNo: ' R001 ' })
    ).toMatchObject({ noteDate: '2026-10-14', resourceNo: 'R001', note: '', noProjectWork: false });
  });

  it('validates a note before it is sent', () => {
    const input = { noteDate: '2026-10-14', resourceNo: '', note: ' Hi ', noProjectWork: false };
    expect(validateDayNoteInput(input).note).toBe('Hi');
    expect(() => validateDayNoteInput({ ...input, note: '  ' })).toThrow('Enter a note');
    expect(() => validateDayNoteInput({ ...input, noteDate: '14/10/2026' })).toThrow();
  });

  describe('canEditPlan', () => {
    it('is true when any loaded project or resource says so', () => {
      expect(canEditPlan({ resources: [{ canEditPlan: false }, { canEditPlan: true }] })).toBe(
        true
      );
      expect(canEditPlan({ projects: [{ canEditPlan: true }] })).toBe(true);
    });

    it('is false when none do, or the extension is too old to say', () => {
      expect(canEditPlan({ resources: [{}, { canEditPlan: false }], projects: [{}] })).toBe(false);
      expect(canEditPlan({})).toBe(false);
    });
  });

  it('recognises a conflicting change from BC', () => {
    expect(isDayNoteConflict(new Error('BC API Error (412): changed'))).toBe(true);
    expect(isDayNoteConflict(new Error('BC API Error (409): changed'))).toBe(true);
    expect(isDayNoteConflict(new Error('BC API Error (400): bad'))).toBe(false);
    expect(isDayNoteConflict('412')).toBe(false);
  });
});
