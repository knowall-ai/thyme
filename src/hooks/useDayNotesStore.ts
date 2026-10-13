import { create } from 'zustand';
import type { BCDayNote, BCDayNoteInput } from '@/types';
import { bcClient } from '@/services/bc';
import { useCompanyStore } from './useCompanyStore';

interface DayNotesRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
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
  /** Add, change or delete a note, then reload the visible dates. Throws on failure. */
  createNote: (input: BCDayNoteInput) => Promise<void>;
  updateNote: (note: BCDayNote, input: BCDayNoteInput) => Promise<void>;
  deleteNote: (note: BCDayNote) => Promise<void>;
  reset: () => void;
}

// Notes by range ("from|to"), so moving back to weeks already seen needs no fetch. Cleared
// after any edit, as a note may fall in several cached ranges.
let cache = new Map<string, BCDayNote[]>();
// Bumped on reset (company switch) so late responses from before it are dropped
let generation = 0;

const rangeKey = (from: string, to: string) => `${from}|${to}`;

export const useDayNotesStore = create<DayNotesStore>((set, get) => {
  /** Reload the visible range after an edit */
  async function refresh() {
    cache = new Map();
    const { range } = get();
    if (range) await get().load(range.from, range.to, { force: true });
  }

  return {
    available: null,
    notes: [],
    range: null,
    isLoading: false,

    load: async (from, to, options) => {
      if (get().available === false) return;
      const key = rangeKey(from, to);
      const cached = cache.get(key);
      if (cached && !options?.force) {
        set({ notes: cached, range: { from, to } });
        return;
      }

      const loadGeneration = generation;
      // Superseded by a company switch or a newer range
      const isStale = () =>
        loadGeneration !== generation ||
        rangeKey(get().range?.from ?? '', get().range?.to ?? '') !== key;
      set({ range: { from, to }, isLoading: true });
      try {
        const notes = await bcClient.getDayNotes(from, to);
        if (isStale()) return;
        if (notes === undefined) {
          set({ available: false, notes: [], isLoading: false });
          return;
        }
        cache.set(key, notes);
        set({ available: true, notes, isLoading: false });
      } catch (error) {
        if (isStale()) return;
        // Day notes are extra context: keep the Plan usable and show what was there
        console.warn('[Plan] Failed to load day notes:', error);
        set({ isLoading: false });
      }
    },

    createNote: async (input) => {
      await bcClient.createDayNote(input);
      await refresh();
    },

    updateNote: async (note, input) => {
      await bcClient.updateDayNote(note.id, input, note['@odata.etag']);
      await refresh();
    },

    deleteNote: async (note) => {
      await bcClient.deleteDayNote(note.id, note['@odata.etag']);
      await refresh();
    },

    reset: () => {
      generation += 1;
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
