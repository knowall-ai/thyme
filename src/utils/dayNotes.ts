import type { BCDayNote, BCDayNoteInput } from '@/types';

/** The longest note BC accepts (its Note field is Text[100]) */
export const DAY_NOTE_MAX_LENGTH = 100;

/**
 * A raw dayNotes record off the wire, with blanks filled in: BC sends '' for a company-wide
 * note's resource, and older or partial payloads may leave fields out.
 */
export function normalizeDayNote(raw: Partial<BCDayNote> & { id: string }): BCDayNote {
  return {
    id: raw.id,
    entryNo: Number(raw.entryNo) || 0,
    noteDate: (raw.noteDate ?? '').slice(0, 10),
    resourceNo: (raw.resourceNo ?? '').trim(),
    note: raw.note ?? '',
    noProjectWork: raw.noProjectWork === true,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    lastModifiedDateTime: raw.lastModifiedDateTime,
    '@odata.etag': raw['@odata.etag'],
  };
}

/**
 * Check and tidy a note before it's sent: the text is trimmed and must be 1 to
 * DAY_NOTE_MAX_LENGTH characters, and the date must be YYYY-MM-DD.
 * @throws Error describing the first problem
 */
export function validateDayNoteInput(input: BCDayNoteInput): BCDayNoteInput {
  const note = input.note.trim();
  if (!note) throw new Error('Enter a note');
  if (note.length > DAY_NOTE_MAX_LENGTH) {
    throw new Error(`A note can be at most ${DAY_NOTE_MAX_LENGTH} characters`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.noteDate)) {
    throw new Error('Invalid note date. Expected YYYY-MM-DD.');
  }
  return {
    noteDate: input.noteDate,
    resourceNo: input.resourceNo.trim(),
    note,
    noProjectWork: input.noProjectWork,
  };
}

/** A day's notes: company-wide ones, and each person's own */
export interface DayNotesForDate {
  company: BCDayNote[];
  byResource: Map<string, BCDayNote[]>;
}

/** Day notes grouped by date (YYYY-MM-DD) */
export type DayNotesIndex = Map<string, DayNotesForDate>;

/** Group notes by date and person, each list in entry order (oldest first) */
export function buildDayNotesIndex(notes: BCDayNote[]): DayNotesIndex {
  const index: DayNotesIndex = new Map();
  const sorted = [...notes].sort((a, b) => a.entryNo - b.entryNo);
  for (const note of sorted) {
    let day = index.get(note.noteDate);
    if (!day) {
      day = { company: [], byResource: new Map() };
      index.set(note.noteDate, day);
    }
    if (!note.resourceNo) {
      day.company.push(note);
    } else {
      const list = day.byResource.get(note.resourceNo) ?? [];
      list.push(note);
      day.byResource.set(note.resourceNo, list);
    }
  }
  return index;
}

/** Every note on a day, company-wide first, then by person */
export function getNotesForDate(index: DayNotesIndex, date: string): BCDayNote[] {
  const day = index.get(date);
  if (!day) return [];
  const people = [...day.byResource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, notes]) => notes);
  return [...day.company, ...people];
}

/**
 * Why a day isn't available for project work - the note text, e.g. "Company Off-Site" -
 * from the company's notes or (when given) that person's, or undefined when it is.
 */
export function getNoProjectWorkReason(
  index: DayNotesIndex,
  date: string,
  resourceNumber?: string
): string | undefined {
  const day = index.get(date);
  if (!day) return undefined;
  const notes = [
    ...day.company,
    ...(resourceNumber ? (day.byResource.get(resourceNumber) ?? []) : []),
  ].filter((note) => note.noProjectWork);
  if (notes.length === 0) return undefined;
  return notes.map((note) => note.note).join('; ');
}

/**
 * Tooltip for a set of notes: the note itself when there's one, else a count and a line
 * per note. `describeResource`, when given, puts the person's name before their notes
 * (company-wide notes have none).
 */
export function formatDayNotesTitle(
  notes: BCDayNote[],
  describeResource?: (resourceNo: string) => string
): string {
  const line = (note: BCDayNote) => {
    const who = note.resourceNo && describeResource ? `${describeResource(note.resourceNo)}: ` : '';
    return `${who}${note.note}${note.noProjectWork ? ' (no project work)' : ''}`;
  };
  if (notes.length === 1) return line(notes[0]);
  return [`${notes.length} notes`, ...notes.map((note) => `  ${line(note)}`)].join('\n');
}

/**
 * Whether the signed-in user may change plans and day notes. BC says so per record
 * (canEditPlan on the projects and resources APIs, the same check for each), so any loaded
 * project or resource saying yes is enough. Unknown (an older extension) counts as no.
 */
export function canEditPlan(records: {
  resources?: { canEditPlan?: boolean }[];
  projects?: { canEditPlan?: boolean }[];
}): boolean {
  return (
    (records.resources ?? []).some((r) => r.canEditPlan === true) ||
    (records.projects ?? []).some((p) => p.canEditPlan === true)
  );
}

/** Shown when a note changed (or went) after the user started changing it */
export const DAY_NOTE_CONFLICT_MESSAGE =
  'This note changed since you opened it — reload to see the latest.';

/**
 * BC refused a change because the note's ETag no longer matches (412 Precondition Failed), or
 * reported a conflicting change (409): someone else changed the note first.
 */
export function isDayNoteConflict(error: unknown): boolean {
  return error instanceof Error && /^BC API Error \((409|412)\)/.test(error.message);
}
