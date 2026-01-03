import { create } from 'zustand';
import type { TimeEntry, WeekData } from '@/types';
import { timeEntryService } from '@/services/bc';
import { getWeekStart, formatDate, getWeekEnd } from '@/utils';

interface TimeEntriesStore {
  entries: TimeEntry[];
  currentWeekStart: Date;
  isLoading: boolean;
  error: string | null;

  fetchWeekEntries: (userId: string, weekStart?: Date) => Promise<void>;
  addEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => Promise<TimeEntry>;
  updateEntry: (entryId: string, updates: Partial<TimeEntry>) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  copyPreviousWeek: (userId: string) => Promise<void>;
  navigateToWeek: (direction: 'prev' | 'next') => void;
  goToCurrentWeek: () => void;
  getWeekData: () => WeekData;
  getEntriesForDay: (date: string) => TimeEntry[];
  getTotalHours: () => number;
  getDailyTotals: () => { [date: string]: number };
}

export const useTimeEntriesStore = create<TimeEntriesStore>((set, get) => ({
  entries: [],
  currentWeekStart: getWeekStart(new Date()),
  isLoading: false,
  error: null,

  fetchWeekEntries: async (userId: string, weekStart?: Date) => {
    const week = weekStart || get().currentWeekStart;
    set({ isLoading: true, error: null, currentWeekStart: week });

    try {
      const entries = await timeEntryService.getWeekEntries(week, userId);
      set({ entries, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch entries';
      set({ error: message, isLoading: false });
    }
  },

  addEntry: async (entryData) => {
    try {
      const entry = await timeEntryService.createEntry(entryData);
      set((state) => ({ entries: [...state.entries, entry] }));
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add entry';
      set({ error: message });
      throw error;
    }
  },

  updateEntry: async (entryId: string, updates: Partial<TimeEntry>) => {
    try {
      const updated = await timeEntryService.updateEntry(entryId, updates);
      if (updated) {
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? updated : e)),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update entry';
      set({ error: message });
      throw error;
    }
  },

  deleteEntry: async (entryId: string) => {
    try {
      const success = await timeEntryService.deleteEntry(entryId);
      if (success) {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== entryId),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete entry';
      set({ error: message });
      throw error;
    }
  },

  copyPreviousWeek: async (userId: string) => {
    const { currentWeekStart } = get();
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    try {
      set({ isLoading: true });
      const newEntries = await timeEntryService.copyFromPreviousWeek(
        previousWeekStart,
        currentWeekStart,
        userId
      );
      set((state) => ({
        entries: [...state.entries, ...newEntries],
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy entries';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  navigateToWeek: (direction: 'prev' | 'next') => {
    set((state) => {
      const newWeekStart = new Date(state.currentWeekStart);
      newWeekStart.setDate(
        newWeekStart.getDate() + (direction === 'next' ? 7 : -7)
      );
      return { currentWeekStart: newWeekStart };
    });
  },

  goToCurrentWeek: () => {
    set({ currentWeekStart: getWeekStart(new Date()) });
  },

  getWeekData: () => {
    const { entries, currentWeekStart } = get();
    const weekEnd = getWeekEnd(currentWeekStart);
    const totalHours = timeEntryService.calculateTotalHours(entries);
    const dailyTotals = timeEntryService.getDailyTotals(entries);

    return {
      weekStart: currentWeekStart,
      weekEnd,
      entries,
      totalHours,
      dailyTotals,
    };
  },

  getEntriesForDay: (date: string) => {
    const { entries } = get();
    return entries.filter((e) => e.date === date);
  },

  getTotalHours: () => {
    const { entries } = get();
    return timeEntryService.calculateTotalHours(entries);
  },

  getDailyTotals: () => {
    const { entries } = get();
    return timeEntryService.getDailyTotals(entries);
  },
}));
