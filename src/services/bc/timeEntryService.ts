import toast from 'react-hot-toast';
import { bcClient } from './bcClient';
import type { TimeEntry, BCJobJournalLine, Project, BCEmployee } from '@/types';
import { format, parseISO } from 'date-fns';

// Local storage key for time entries (cached/pending sync)
const TIME_ENTRIES_KEY = 'thyme_time_entries';
const JOURNAL_TEMPLATE = 'JOB';
const JOURNAL_BATCH = 'DEFAULT';

function getLocalEntries(): TimeEntry[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(TIME_ENTRIES_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveLocalEntries(entries: TimeEntry[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(entries));
}

function generateId(): string {
  return `local_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function mapTimeEntryToBCLine(
  entry: TimeEntry,
  resourceNumber: string,
  projectCode: string,
  taskCode: string
): Omit<BCJobJournalLine, 'id' | 'lineNumber'> {
  return {
    journalTemplateName: JOURNAL_TEMPLATE,
    journalBatchName: JOURNAL_BATCH,
    postingDate: entry.date,
    type: 'Resource',
    number: resourceNumber,
    jobNumber: projectCode,
    jobTaskNumber: taskCode,
    description: entry.notes || 'Time entry from Thyme',
    quantity: entry.hours,
    unitOfMeasureCode: 'HOUR',
  };
}

export const timeEntryService = {
  // Get entries for a date range
  async getEntries(startDate: Date, endDate: Date, userId: string): Promise<TimeEntry[]> {
    // Get local entries
    const localEntries = getLocalEntries().filter((entry) => {
      const entryDate = parseISO(entry.date);
      return entry.userId === userId && entryDate >= startDate && entryDate <= endDate;
    });

    return localEntries;
  },

  // Get entries for a specific week
  async getWeekEntries(weekStart: Date, userId: string): Promise<TimeEntry[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return this.getEntries(weekStart, weekEnd, userId);
  },

  // Create a new time entry
  async createEntry(
    entry: Omit<TimeEntry, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>
  ): Promise<TimeEntry> {
    const newEntry: TimeEntry = {
      ...entry,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    const entries = getLocalEntries();
    entries.push(newEntry);
    saveLocalEntries(entries);

    return newEntry;
  },

  // Update an existing entry
  async updateEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    const entries = getLocalEntries();
    const index = entries.findIndex((e) => e.id === entryId);

    if (index === -1) return null;

    entries[index] = {
      ...entries[index],
      ...updates,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    saveLocalEntries(entries);
    return entries[index];
  },

  // Delete an entry
  async deleteEntry(entryId: string): Promise<boolean> {
    const entries = getLocalEntries();
    const index = entries.findIndex((e) => e.id === entryId);

    if (index === -1) return false;

    entries.splice(index, 1);
    saveLocalEntries(entries);
    return true;
  },

  // Sync pending entries to Business Central
  async syncToBusinessCentral(
    resourceNumber: string,
    projects: Project[]
  ): Promise<{ synced: number; failed: number }> {
    const entries = getLocalEntries();
    const pendingEntries = entries.filter((e) => e.syncStatus === 'pending');
    let synced = 0;
    let failed = 0;

    for (const entry of pendingEntries) {
      try {
        const project = projects.find((p) => p.id === entry.projectId);
        const task = project?.tasks.find((t) => t.id === entry.taskId);

        if (!project || !task) {
          console.error(`Project or task not found for entry ${entry.id}`);
          failed++;
          continue;
        }

        const bcLine = mapTimeEntryToBCLine(entry, resourceNumber, project.code, task.code);

        const createdLine = await bcClient.createJobJournalLine(bcLine);

        // Update local entry with BC reference
        entry.bcJobJournalLineId = createdLine.id;
        entry.syncStatus = 'synced';
        synced++;
      } catch (error) {
        console.error(`Failed to sync entry ${entry.id}:`, error);
        entry.syncStatus = 'error';
        failed++;
      }
    }

    saveLocalEntries(entries);

    // Show user-friendly notifications for sync results
    if (synced > 0 && failed === 0) {
      toast.success(
        `Successfully synced ${synced} time ${synced === 1 ? 'entry' : 'entries'} to Business Central`
      );
    } else if (synced > 0 && failed > 0) {
      toast.error(
        `Synced ${synced} ${synced === 1 ? 'entry' : 'entries'}, but ${failed} failed. Check console for details.`
      );
    } else if (failed > 0) {
      toast.error(
        `Failed to sync ${failed} time ${failed === 1 ? 'entry' : 'entries'}. Please try again.`
      );
    }

    return { synced, failed };
  },

  // Copy entries from previous week
  async copyFromPreviousWeek(
    previousWeekStart: Date,
    currentWeekStart: Date,
    userId: string
  ): Promise<TimeEntry[]> {
    const previousEntries = await this.getWeekEntries(previousWeekStart, userId);
    const newEntries: TimeEntry[] = [];

    for (const entry of previousEntries) {
      // Calculate offset (days from previous week start)
      const entryDate = parseISO(entry.date);
      const dayOffset = (entryDate.getTime() - previousWeekStart.getTime()) / (1000 * 60 * 60 * 24);

      // Create new date in current week
      const newDate = new Date(currentWeekStart);
      newDate.setDate(newDate.getDate() + dayOffset);

      const newEntry = await this.createEntry({
        projectId: entry.projectId,
        taskId: entry.taskId,
        userId: entry.userId,
        date: format(newDate, 'yyyy-MM-dd'),
        hours: entry.hours,
        notes: entry.notes,
        isBillable: entry.isBillable,
        isRunning: false,
      });

      newEntries.push(newEntry);
    }

    return newEntries;
  },

  // Calculate total hours for a set of entries
  calculateTotalHours(entries: TimeEntry[]): number {
    return entries.reduce((sum, entry) => sum + entry.hours, 0);
  },

  // Get daily totals
  getDailyTotals(entries: TimeEntry[]): { [date: string]: number } {
    return entries.reduce(
      (totals, entry) => {
        totals[entry.date] = (totals[entry.date] || 0) + entry.hours;
        return totals;
      },
      {} as { [date: string]: number }
    );
  },

  // Get entries for a teammate from Business Central
  // This fetches job journal lines (unposted/pending time entries) for a specific employee
  async getTeammateEntries(weekStart: Date, teammate: BCEmployee): Promise<TimeEntry[]> {
    try {
      // Get resource by employee email to find their resource number
      const resource = teammate.email ? await bcClient.getResourceByEmail(teammate.email) : null;

      if (!resource) {
        // If no resource found, we can't fetch their entries
        console.warn(`No resource found for employee ${teammate.displayName}`);
        return [];
      }

      // Fetch job journal lines for this resource
      const lines = await bcClient.getJobJournalLines(JOURNAL_TEMPLATE, JOURNAL_BATCH);

      // Filter by resource number and date range
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const filteredLines = lines.filter((line) => {
        if (line.number !== resource.number) return false;
        const lineDate = parseISO(line.postingDate);
        return lineDate >= weekStart && lineDate <= weekEnd;
      });

      // Map BC job journal lines to TimeEntry format
      return filteredLines.map((line) => ({
        id: line.id || `bc_${line.lineNumber}`,
        projectId: line.jobNumber,
        taskId: line.jobTaskNumber,
        userId: teammate.id,
        date: line.postingDate,
        hours: line.quantity,
        notes: line.description,
        isBillable: true,
        isRunning: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bcJobJournalLineId: line.id,
        syncStatus: 'synced' as const,
      }));
    } catch (error) {
      console.error('Failed to fetch teammate entries:', error);
      return [];
    }
  },
};
