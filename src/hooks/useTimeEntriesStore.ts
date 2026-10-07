import { create } from 'zustand';
import type { TimeEntry, WeekData, Teammate, BCTimeSheet, TimesheetDisplayStatus } from '@/types';
import {
  timeEntryService,
  NoResourceError,
  NoTimesheetError,
  TimesheetNotEditableError,
  ExtensionNotInstalledError,
  bcClient,
} from '@/services/bc';
import { getWeekStart, getWeekEnd } from '@/utils';
import { format } from 'date-fns';

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
  extensionNotInstalled: boolean;
  userEmail: string | null;
  // Resource the missing timesheet would belong to, so it can be created from the UI
  missingTimesheetResourceNo: string | null;
  // Week the missing timesheet is for, captured with the resource so Create can't drift
  missingTimesheetWeek: Date | null;
  // When the current timesheet last changed: BC's latest timestamp when loaded, moved to
  // "now" by edits made here (compared with Poppie's review to tell it's out of date)
  timesheetVersionStamp: string | null;

  // Entry operations
  fetchWeekEntries: (userId: string, weekStart?: Date) => Promise<void>;
  fetchTeammateEntries: (teammate: Teammate, weekStart?: Date) => Promise<void>;
  addEntry: (
    entry: Omit<
      TimeEntry,
      'id' | 'createdAt' | 'updatedAt' | 'bcTimeSheetLineId' | 'bcTimeSheetNo' | 'lineStatus'
    >
  ) => Promise<TimeEntry>;
  updateEntry: (entryId: string, updates: Partial<TimeEntry>) => Promise<void>;
  moveEntryDate: (entryId: string, newDate: string) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  clearEntries: () => void;
  copyPreviousWeek: (userId: string) => Promise<void>;

  // Week navigation
  navigateToWeek: (direction: 'prev' | 'next') => void;
  goToCurrentWeek: () => void;
  goToDate: (date: Date) => void;

  // Timesheet operations
  createTimesheet: () => Promise<void>;
  submitTimesheet: () => Promise<void>;
  reopenTimesheet: () => Promise<void>;
  isTimesheetEditable: () => boolean;

  // Computed values
  getWeekData: () => WeekData;
  getEntriesForDay: (date: string) => TimeEntry[];
  getTotalHours: () => number;
  getDailyTotals: () => { [date: string]: number };
}

// Latest week/person load, so a slower earlier one can't overwrite its result
let weekFetchSeq = 0;

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
  extensionNotInstalled: false,
  userEmail: null,
  missingTimesheetResourceNo: null,
  missingTimesheetWeek: null,
  timesheetVersionStamp: null,

  fetchWeekEntries: async (userId: string, weekStart?: Date) => {
    const week = weekStart || get().currentWeekStart;
    const seq = ++weekFetchSeq;
    set({
      isLoading: true,
      error: null,
      currentWeekStart: week,
      noTimesheetExists: false,
      noResourceExists: false,
      extensionNotInstalled: false,
      missingTimesheetResourceNo: null,
      missingTimesheetWeek: null,
      userEmail: userId,
    });

    try {
      const entries = await timeEntryService.getWeekEntries(week, userId);
      // A newer week/person load has started: this result is stale
      if (seq !== weekFetchSeq) return;
      const timesheet = timeEntryService.getCurrentTimesheet();
      const status = timesheet ? bcClient.getTimesheetDisplayStatus(timesheet) : null;

      set({
        entries,
        currentTimesheet: timesheet,
        timesheetStatus: status,
        timesheetVersionStamp: timesheet ? timeEntryService.getCurrentVersionStamp() : null,
        isLoading: false,
        noTimesheetExists: false,
        noResourceExists: false,
        extensionNotInstalled: false,
      });
    } catch (error) {
      if (seq !== weekFetchSeq) return;
      if (error instanceof ExtensionNotInstalledError) {
        set({
          entries: [],
          currentTimesheet: null,
          timesheetStatus: null,
          noTimesheetExists: false,
          noResourceExists: false,
          extensionNotInstalled: true,
          isLoading: false,
          error: error.message,
        });
      } else if (error instanceof NoResourceError) {
        set({
          entries: [],
          currentTimesheet: null,
          timesheetStatus: null,
          noTimesheetExists: false,
          noResourceExists: true,
          extensionNotInstalled: false,
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
          extensionNotInstalled: false,
          missingTimesheetResourceNo: error.resourceNo,
          missingTimesheetWeek: week,
          isLoading: false,
          error: error.message,
        });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to fetch entries';
        set({ error: message, isLoading: false });
      }
    }
  },

  fetchTeammateEntries: async (teammate: Teammate, weekStart?: Date) => {
    const week = weekStart || get().currentWeekStart;
    const seq = ++weekFetchSeq;
    set({
      isLoading: true,
      error: null,
      currentWeekStart: week,
      noTimesheetExists: false,
      missingTimesheetResourceNo: null,
      missingTimesheetWeek: null,
    });

    try {
      const entries = await timeEntryService.getTeammateEntries(week, teammate);
      // A newer week/person load has started: this result is stale
      if (seq !== weekFetchSeq) return;
      set({ entries, isLoading: false });
    } catch (error) {
      if (seq !== weekFetchSeq) return;
      if (error instanceof NoTimesheetError) {
        set({
          entries: [],
          noTimesheetExists: true,
          missingTimesheetResourceNo: error.resourceNo,
          missingTimesheetWeek: week,
          isLoading: false,
          error: error.message,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch teammate entries';
      set({ error: message, isLoading: false });
    }
  },

  addEntry: async (entryData) => {
    try {
      const entry = await timeEntryService.createEntry(entryData);
      // BC aggregates hours on the same line/date, so update existing entry if ID matches
      set((state) => {
        const existingIndex = state.entries.findIndex((e) => e.id === entry.id);
        if (existingIndex >= 0) {
          // Update existing entry
          const newEntries = [...state.entries];
          newEntries[existingIndex] = entry;
          return { entries: newEntries, timesheetVersionStamp: new Date().toISOString() };
        }
        // Add new entry
        return {
          entries: [...state.entries, entry],
          timesheetVersionStamp: new Date().toISOString(),
        };
      });
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
          timesheetVersionStamp: new Date().toISOString(),
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

  moveEntryDate: async (entryId: string, newDate: string) => {
    const { userEmail } = get();
    try {
      await timeEntryService.moveEntryDate(entryId, newDate);
      // Re-derive entries from the service's cache so merges/splits are reflected
      const refreshed = timeEntryService.getCachedEntries(userEmail || '');
      set({ entries: refreshed, timesheetVersionStamp: new Date().toISOString() });
    } catch (error) {
      if (error instanceof TimesheetNotEditableError) {
        set({ error: error.message });
      } else {
        const message = error instanceof Error ? error.message : 'Failed to move entry';
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
          timesheetVersionStamp: new Date().toISOString(),
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
    // Supersede any week load still in flight (e.g. the previous company's), so it
    // can't repopulate the store after it's been cleared
    weekFetchSeq += 1;
    set({
      entries: [],
      isLoading: false,
      error: null,
      currentTimesheet: null,
      timesheetStatus: null,
      noTimesheetExists: false,
      noResourceExists: false,
      extensionNotInstalled: false,
      missingTimesheetResourceNo: null,
      missingTimesheetWeek: null,
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
        timesheetVersionStamp:
          newEntries.length > 0 ? new Date().toISOString() : state.timesheetVersionStamp,
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

  // Creates the timesheet only. The caller re-reads the week afterwards, since whether
  // that means your own timesheet or a teammate's depends on what is being viewed.
  createTimesheet: async () => {
    // Resource and week come from the same "no timesheet" result, so they always match
    // what's on screen even if the user has since switched person or week
    const resourceNo = get().missingTimesheetResourceNo;
    const week = get().missingTimesheetWeek;
    if (!resourceNo || !week) {
      throw new Error('No resource is available to create a timesheet for');
    }

    try {
      set({ isLoading: true, error: null });
      await bcClient.createTimeSheet(resourceNo, format(week, 'yyyy-MM-dd'));
      set({
        missingTimesheetResourceNo: null,
        missingTimesheetWeek: null,
        noTimesheetExists: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create timesheet';
      set({ error: message, isLoading: false });
      throw error;
    }
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
