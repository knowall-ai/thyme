import { create } from 'zustand';
import type { TimeEntry, WeekData, BCEmployee, BCTimeSheet, TimesheetDisplayStatus } from '@/types';
import {
  timeEntryService,
  NoResourceError,
  NoTimesheetError,
  TimesheetNotEditableError,
  bcClient,
} from '@/services/bc';
import { getWeekStart, getWeekEnd } from '@/utils';

interface TimeEntriesStore {
  entries: TimeEntry[];
  currentWeekStart: Date;
  isLoading: boolean;
  error: string | null;

  // Timesheet state
  currentTimesheet: BCTimeSheet | null;
  timesheetStatus: TimesheetDisplayStatus | null;
  noTimesheetExists: boolean;
  noResourceExists: boolean;
  userEmail: string | null;

  // Entry operations
  fetchWeekEntries: (userId: string, weekStart?: Date) => Promise<void>;
  fetchTeammateEntries: (teammate: BCEmployee, weekStart?: Date) => Promise<void>;
  addEntry: (
    entry: Omit<
      TimeEntry,
      'id' | 'createdAt' | 'updatedAt' | 'bcTimeSheetLineId' | 'bcTimeSheetNo' | 'lineStatus'
    >
  ) => Promise<TimeEntry>;
  updateEntry: (entryId: string, updates: Partial<TimeEntry>) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  clearEntries: () => void;
  copyPreviousWeek: (userId: string) => Promise<void>;

  // Week navigation
  navigateToWeek: (direction: 'prev' | 'next') => void;
  goToCurrentWeek: () => void;
  goToDate: (date: Date) => void;

  // Timesheet operations
  submitTimesheet: () => Promise<void>;
  reopenTimesheet: () => Promise<void>;
  isTimesheetEditable: () => boolean;

  // Computed values
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

  // Timesheet state
  currentTimesheet: null,
  timesheetStatus: null,
  noTimesheetExists: false,
  noResourceExists: false,
  userEmail: null,

  fetchWeekEntries: async (userId: string, weekStart?: Date) => {
    const week = weekStart || get().currentWeekStart;
    set({
      isLoading: true,
      error: null,
      currentWeekStart: week,
      noTimesheetExists: false,
      noResourceExists: false,
      userEmail: userId,
    });

    try {
      const entries = await timeEntryService.getWeekEntries(week, userId);
      const timesheet = timeEntryService.getCurrentTimesheet();
      const status = timesheet ? bcClient.getTimesheetDisplayStatus(timesheet) : null;

      set({
        entries,
        currentTimesheet: timesheet,
        timesheetStatus: status,
        isLoading: false,
        noTimesheetExists: false,
        noResourceExists: false,
      });
    } catch (error) {
      if (error instanceof NoResourceError) {
        set({
          entries: [],
          currentTimesheet: null,
          timesheetStatus: null,
          noTimesheetExists: false,
          noResourceExists: true,
          isLoading: false,
          error: error.message,
        });
      } else if (error instanceof NoTimesheetError) {
        set({
          entries: [],
          currentTimesheet: null,
          timesheetStatus: null,
          noTimesheetExists: true,
          noResourceExists: false,
          isLoading: false,
          error: error.message,
        });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch entries';
        set({ error: message, isLoading: false });
      }
    }
  },

  fetchTeammateEntries: async (teammate: BCEmployee, weekStart?: Date) => {
    const week = weekStart || get().currentWeekStart;
    set({ isLoading: true, error: null, currentWeekStart: week });

    try {
      const entries = await timeEntryService.getTeammateEntries(week, teammate);
      set({ entries, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch teammate entries';
      set({ error: message, isLoading: false });
    }
  },

  addEntry: async (entryData) => {
    try {
      const entry = await timeEntryService.createEntry(entryData);
      set((state) => ({ entries: [...state.entries, entry] }));
      return entry;
    } catch (error) {
      if (error instanceof TimesheetNotEditableError) {
        set({ error: error.message });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to add entry';
        set({ error: message });
      }
      throw error;
    }
  },

  updateEntry: async (entryId: string, updates: Partial<TimeEntry>) => {
    try {
      const updated = await timeEntryService.updateEntry(entryId, updates);
      if (updated) {
        set((state) => ({
          entries: state.entries.map((e) => (e.id === entryId ? { ...e, ...updated } : e)),
        }));
      }
    } catch (error) {
      if (error instanceof TimesheetNotEditableError) {
        set({ error: error.message });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to update entry';
        set({ error: message });
      }
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
      if (error instanceof TimesheetNotEditableError) {
        set({ error: error.message });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to delete entry';
        set({ error: message });
      }
      throw error;
    }
  },

  clearEntries: () => {
    set({
      entries: [],
      error: null,
      currentTimesheet: null,
      timesheetStatus: null,
      noTimesheetExists: false,
      noResourceExists: false,
      userEmail: null,
    });
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
      if (error instanceof TimesheetNotEditableError) {
        set({ error: error.message, isLoading: false });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to copy entries';
        set({ error: message, isLoading: false });
      }
      throw error;
    }
  },

  navigateToWeek: (direction: 'prev' | 'next') => {
    set((state) => {
      const newWeekStart = new Date(state.currentWeekStart);
      newWeekStart.setDate(newWeekStart.getDate() + (direction === 'next' ? 7 : -7));
      return { currentWeekStart: newWeekStart };
    });
  },

  goToCurrentWeek: () => {
    set({ currentWeekStart: getWeekStart(new Date()) });
  },

  goToDate: (date: Date) => {
    set({ currentWeekStart: getWeekStart(date) });
  },

  submitTimesheet: async () => {
    try {
      set({ isLoading: true });
      await timeEntryService.submitTimesheet();
      const timesheet = timeEntryService.getCurrentTimesheet();
      const status = timesheet ? bcClient.getTimesheetDisplayStatus(timesheet) : null;
      set({
        currentTimesheet: timesheet,
        timesheetStatus: status,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit timesheet';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  reopenTimesheet: async () => {
    try {
      set({ isLoading: true });
      await timeEntryService.reopenTimesheet();
      const timesheet = timeEntryService.getCurrentTimesheet();
      const status = timesheet ? bcClient.getTimesheetDisplayStatus(timesheet) : null;
      set({
        currentTimesheet: timesheet,
        timesheetStatus: status,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reopen timesheet';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  isTimesheetEditable: () => {
    return timeEntryService.isTimesheetEditable();
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
