import { create } from 'zustand';
import type { BCDayNote, BCDayNoteInput } from '@/types';
import { bcClient } from '@/services/bc';
import { useCompanyStore } from './useCompanyStore';

interface DayNotesRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

/**
 * How a saved change went: the change itself succeeded (otherwise the action throws), and
 * whether re-reading the visible dates afterwards did too. When it didn't, the change is
 * still shown, from BC's response, but other people's changes may not be.
 */
export interface DayNoteMutationResult {
  revalidated: boolean;
}

interface DayNotesStore {
  /** Whether the dayNotes endpoint exists (null until the first response); false hides the feature */
  available: boolean | null;
  /** Notes for `range`, the dates the Plan grid is showing */
  notes: BCDayNote[];
  range: DayNotesRange | null;
  isLoading: boolean;

  /** Load notes for the visible dates; a range loaded before comes from the cache */
  load: (from: string, to: string, options?: { force?: boolean }) => Promise<void>;
  /**
   * Add, change or delete a note. Throws when BC rejects it. On success the change is applied
   * straight away (with the note's new ETag), then the visible dates are re-read.
   */
  createNote: (input: BCDayNoteInput) => Promise<DayNoteMutationResult>;
  updateNote: (note: BCDayNote, input: BCDayNoteInput) => Promise<DayNoteMutationResult>;
  deleteNote: (note: BCDayNote) => Promise<DayNoteMutationResult>;
  reset: () => void;
}

// Notes by range ("from|to"), so moving back to weeks already seen needs no fetch. Cleared
// after any edit, as a note may fall in several cached ranges.
let cache = new Map<string, BCDayNote[]>();
// Bumped on reset (company switch) so late responses from before it are dropped
let generation = 0;
// Bumped by every read and every applied change: a read's response is only used if nothing
// started or changed since, so an older read can't overwrite a newer one or an edit
let requestSeq = 0;

const rangeKey = (from: string, to: string) => `${from}|${to}`;

type FetchOutcome = 'loaded' | 'unavailable' | 'failed' | 'stale';

const inRange = (note: BCDayNote, range: DayNotesRange | null) =>
  !!range && note.noteDate >= range.from && note.noteDate <= range.to;

export const useDayNotesStore = create<DayNotesStore>((set, get) => {
  async function fetchRange(from: string, to: string): Promise<FetchOutcome> {
    const key = rangeKey(from, to);
    const seq = ++requestSeq;
    const loadGeneration = generation;
    // Superseded by a company switch, a newer read or change, or a different range
    const isStale = () =>
      seq !== requestSeq ||
      loadGeneration !== generation ||
      rangeKey(get().range?.from ?? '', get().range?.to ?? '') !== key;
    set({ range: { from, to }, isLoading: true });
    try {
      const notes = await bcClient.getDayNotes(from, to);
      if (isStale()) return 'stale';
      if (notes === undefined) {
        set({ available: false, notes: [], isLoading: false });
        return 'unavailable';
      }
      cache.set(key, notes);
      set({ available: true, notes, isLoading: false });
      return 'loaded';
    } catch (error) {
      if (isStale()) return 'stale';
      // Day notes are extra context: keep the Plan usable and show what was there
      console.warn('[Plan] Failed to load day notes:', error);
      set({ isLoading: false });
      return 'failed';
    }
  }

  /**
   * Show a saved change at once - `saved` replaces the note with its id (with its new ETag),
   * or null removes it - then re-read the visible dates. Applying it supersedes any read
   * still in flight, which may have started before the change.
   */
  async function applyAndRevalidate(
    id: string,
    saved: BCDayNote | null
  ): Promise<DayNoteMutationResult> {
    requestSeq += 1;
    cache = new Map();
    const { range, notes } = get();
    const others = notes.filter((n) => n.id !== id);
    const next = saved && inRange(saved, range) ? [...others, saved] : others;
    set({ notes: next, isLoading: false });
    if (range) cache.set(rangeKey(range.from, range.to), next);
    if (!range) return { revalidated: true };

    const outcome = await fetchRange(range.from, range.to);
    // Stale: a newer read or change took over, and reports for itself
    return { revalidated: outcome !== 'failed' };
  }

  /** A saved record BC sent back, or undefined if the response had none (e.g. empty) */
  const savedRecord = (record: BCDayNote) => (record?.id ? record : undefined);

  return {
    available: null,
    notes: [],
    range: null,
    isLoading: false,

    load: async (from, to, options) => {
      if (get().available === false) return;
      const cached = cache.get(rangeKey(from, to));
      if (cached && !options?.force) {
        // Supersede any read still in flight for another range
        requestSeq += 1;
        set({ notes: cached, range: { from, to }, isLoading: false });
        return;
      }
      await fetchRange(from, to);
    },

    createNote: async (input) => {
      const created = savedRecord(await bcClient.createDayNote(input));
      if (!created) {
        // Nothing to show yet: the re-read picks it up
        return applyAndRevalidate('', null);
      }
      return applyAndRevalidate(created.id, created);
    },

    updateNote: async (note, input) => {
      const updated = savedRecord(
        await bcClient.updateDayNote(note.id, input, note['@odata.etag'])
      );
      // Without the updated record, drop the old one rather than keep its stale ETag
      return applyAndRevalidate(note.id, updated ?? null);
    },

    deleteNote: async (note) => {
      await bcClient.deleteDayNote(note.id, note['@odata.etag']);
      return applyAndRevalidate(note.id, null);
    },

    reset: () => {
      generation += 1;
      requestSeq += 1;
      cache = new Map();
      set({ available: null, notes: [], range: null, isLoading: false });
    },
  };
});

// Notes belong to a company: drop them when the company changes
useCompanyStore.subscribe((state, prev) => {
  if (state.companyVersion !== prev.companyVersion) {
    useDayNotesStore.getState().reset();
  }
});
