import toast from 'react-hot-toast';
import { bcClient } from './bcClient';
import type { TimeEntry, BCTimeSheet, BCTimeSheetLine, BCEmployee } from '@/types';
import { format, parseISO, getDay, startOfWeek, addDays } from 'date-fns';

// Error thrown when no timesheet exists for the user/week
export class NoTimesheetError extends Error {
  constructor(resourceNo: string, weekStart: Date) {
    super(
      `No timesheet exists for resource ${resourceNo} for week starting ${format(weekStart, 'yyyy-MM-dd')}. Please contact your manager to create one.`
    );
    this.name = 'NoTimesheetError';
  }
}

// Error thrown when timesheet is not editable (e.g., already submitted/approved)
export class TimesheetNotEditableError extends Error {
  constructor(status: string) {
    super(
      `Timesheet is ${status} and cannot be edited. Please reopen it first if you need to make changes.`
    );
    this.name = 'TimesheetNotEditableError';
  }
}

/**
 * Get the day index (1-7) for a date within its week.
 * BC uses: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
 */
function getDayIndex(date: Date): number {
  const day = getDay(date); // 0=Sun, 1=Mon, ..., 6=Sat
  return day === 0 ? 7 : day; // Convert to 1=Mon, ..., 7=Sun
}

/**
 * Get the quantity field name for a given day index.
 */
function getQuantityField(dayIndex: number): keyof BCTimeSheetLine {
  return `quantity${dayIndex}` as keyof BCTimeSheetLine;
}

/**
 * Convert BC Timesheet Lines to TimeEntry objects.
 * BC stores one line per project/task with daily quantities (quantity1-7).
 * We convert to one TimeEntry per day per project/task.
 */
function bcLinesToTimeEntries(
  lines: BCTimeSheetLine[],
  timesheet: BCTimeSheet,
  userId: string
): TimeEntry[] {
  const entries: TimeEntry[] = [];
  const weekStart = parseISO(timesheet.startingDate);

  for (const line of lines) {
    if (line.type !== 'Job' || !line.jobNo || !line.jobTaskNo) {
      continue; // Skip non-job lines
    }

    // Create an entry for each day that has hours
    for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
      const quantityField = getQuantityField(dayIndex);
      const hours = (line[quantityField] as number) || 0;

      if (hours > 0) {
        const entryDate = addDays(weekStart, dayIndex - 1); // dayIndex 1 = Monday = weekStart

        entries.push({
          id: `${line.id}_${dayIndex}`, // Composite ID: lineId_dayIndex
          projectId: line.jobNo,
          taskId: line.jobTaskNo,
          userId,
          date: format(entryDate, 'yyyy-MM-dd'),
          hours,
          notes: line.description || undefined,
          isBillable: true, // BC timesheets are typically billable
          isRunning: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          bcTimeSheetLineId: line.id,
          bcTimeSheetNo: line.timeSheetNo,
          lineStatus: line.status,
        });
      }
    }
  }

  return entries;
}

/**
 * Parse composite entry ID to get line ID and day index.
 */
function parseEntryId(entryId: string): { lineId: string; dayIndex: number } | null {
  const lastUnderscore = entryId.lastIndexOf('_');
  if (lastUnderscore === -1) return null;

  const lineId = entryId.substring(0, lastUnderscore);
  const dayIndex = parseInt(entryId.substring(lastUnderscore + 1), 10);

  if (isNaN(dayIndex) || dayIndex < 1 || dayIndex > 7) return null;

  return { lineId, dayIndex };
}

export const timeEntryService = {
  /**
   * Current timesheet for the active week (cached per fetch).
   */
  _currentTimesheet: null as BCTimeSheet | null,
  _currentTimesheetLines: [] as BCTimeSheetLine[],

  /**
   * Get the timesheet for a user and week.
   * Throws NoTimesheetError if no timesheet exists.
   */
  async getTimesheet(resourceNo: string, weekStart: Date): Promise<BCTimeSheet> {
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const timesheets = await bcClient.getTimeSheets(resourceNo, weekStartStr);

    if (timesheets.length === 0) {
      throw new NoTimesheetError(resourceNo, weekStart);
    }

    return timesheets[0];
  },

  /**
   * Get entries for a date range.
   * Fetches from BC Timesheet API.
   */
  async getEntries(startDate: Date, endDate: Date, userId: string): Promise<TimeEntry[]> {
    // Get the user's resource number
    const resource = await bcClient.getResourceByEmail(userId);
    if (!resource) {
      toast.error('Could not find your resource record in Business Central.');
      return [];
    }

    // Get the week start (BC timesheets are weekly)
    const weekStart = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday

    try {
      const timesheet = await this.getTimesheet(resource.number, weekStart);
      const lines = await bcClient.getTimeSheetLines(timesheet.number);

      // Cache for later operations
      this._currentTimesheet = timesheet;
      this._currentTimesheetLines = lines;

      return bcLinesToTimeEntries(lines, timesheet, userId);
    } catch (error) {
      if (error instanceof NoTimesheetError) {
        // Clear cache
        this._currentTimesheet = null;
        this._currentTimesheetLines = [];
        throw error;
      }
      throw error;
    }
  },

  /**
   * Get entries for a specific week.
   */
  async getWeekEntries(weekStart: Date, userId: string): Promise<TimeEntry[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return this.getEntries(weekStart, weekEnd, userId);
  },

  /**
   * Get the current timesheet (must call getEntries first).
   */
  getCurrentTimesheet(): BCTimeSheet | null {
    return this._currentTimesheet;
  },

  /**
   * Check if current timesheet is editable.
   */
  isTimesheetEditable(): boolean {
    if (!this._currentTimesheet) return false;
    const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
    return status === 'Open' || status === 'Rejected';
  },

  /**
   * Create a new time entry.
   * Saves directly to BC Timesheet Lines.
   */
  async createEntry(
    entry: Omit<
      TimeEntry,
      'id' | 'createdAt' | 'updatedAt' | 'bcTimeSheetLineId' | 'bcTimeSheetNo' | 'lineStatus'
    >
  ): Promise<TimeEntry> {
    if (!this._currentTimesheet) {
      throw new Error('No timesheet loaded. Please refresh the page.');
    }

    // Check if timesheet is editable
    if (!this.isTimesheetEditable()) {
      const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
      throw new TimesheetNotEditableError(status);
    }

    const entryDate = parseISO(entry.date);
    const dayIndex = getDayIndex(entryDate);

    // Check if a line already exists for this project/task
    const existingLine = this._currentTimesheetLines.find(
      (line) => line.jobNo === entry.projectId && line.jobTaskNo === entry.taskId
    );

    if (existingLine) {
      // Update existing line
      const quantityField = getQuantityField(dayIndex);
      const currentHours = (existingLine[quantityField] as number) || 0;
      const newHours = currentHours + entry.hours;

      const updatedLine = await bcClient.updateTimeSheetLine(
        existingLine.id,
        { [quantityField]: newHours },
        existingLine['@odata.etag'] || '*'
      );

      // Update cache
      const lineIndex = this._currentTimesheetLines.findIndex((l) => l.id === existingLine.id);
      if (lineIndex >= 0) {
        this._currentTimesheetLines[lineIndex] = updatedLine;
      }

      return {
        id: `${updatedLine.id}_${dayIndex}`,
        projectId: entry.projectId,
        taskId: entry.taskId,
        userId: entry.userId,
        date: entry.date,
        hours: entry.hours,
        notes: entry.notes,
        isBillable: entry.isBillable,
        isRunning: entry.isRunning,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bcTimeSheetLineId: updatedLine.id,
        bcTimeSheetNo: updatedLine.timeSheetNo,
        lineStatus: updatedLine.status,
      };
    } else {
      // Create new line
      const newLine = await bcClient.createTimeSheetLine({
        timeSheetNo: this._currentTimesheet.number,
        type: 'Job',
        jobNo: entry.projectId,
        jobTaskNo: entry.taskId,
        description: entry.notes || undefined,
        [getQuantityField(dayIndex)]: entry.hours,
      });

      // Update cache
      this._currentTimesheetLines.push(newLine);

      return {
        id: `${newLine.id}_${dayIndex}`,
        projectId: entry.projectId,
        taskId: entry.taskId,
        userId: entry.userId,
        date: entry.date,
        hours: entry.hours,
        notes: entry.notes,
        isBillable: entry.isBillable,
        isRunning: entry.isRunning,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bcTimeSheetLineId: newLine.id,
        bcTimeSheetNo: newLine.timeSheetNo,
        lineStatus: newLine.status,
      };
    }
  },

  /**
   * Update an existing entry.
   */
  async updateEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    if (!this._currentTimesheet) {
      throw new Error('No timesheet loaded. Please refresh the page.');
    }

    if (!this.isTimesheetEditable()) {
      const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
      throw new TimesheetNotEditableError(status);
    }

    const parsed = parseEntryId(entryId);
    if (!parsed) {
      throw new Error('Invalid entry ID format.');
    }

    const { lineId, dayIndex } = parsed;
    const line = this._currentTimesheetLines.find((l) => l.id === lineId);

    if (!line) {
      throw new Error('Timesheet line not found.');
    }

    const bcUpdates: Record<string, unknown> = {};

    if (updates.hours !== undefined) {
      bcUpdates[getQuantityField(dayIndex)] = updates.hours;
    }

    if (updates.notes !== undefined) {
      bcUpdates.description = updates.notes;
    }

    const updatedLine = await bcClient.updateTimeSheetLine(
      lineId,
      bcUpdates,
      line['@odata.etag'] || '*'
    );

    // Update cache
    const lineIndex = this._currentTimesheetLines.findIndex((l) => l.id === lineId);
    if (lineIndex >= 0) {
      this._currentTimesheetLines[lineIndex] = updatedLine;
    }

    const entryDate = updates.date
      ? parseISO(updates.date)
      : addDays(parseISO(this._currentTimesheet.startingDate), dayIndex - 1);

    return {
      id: entryId,
      projectId: updatedLine.jobNo || '',
      taskId: updatedLine.jobTaskNo || '',
      userId: '', // Will be filled by caller
      date: format(entryDate, 'yyyy-MM-dd'),
      hours: (updatedLine[getQuantityField(dayIndex)] as number) || 0,
      notes: updatedLine.description,
      isBillable: true,
      isRunning: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bcTimeSheetLineId: updatedLine.id,
      bcTimeSheetNo: updatedLine.timeSheetNo,
      lineStatus: updatedLine.status,
    };
  },

  /**
   * Delete an entry.
   * Sets the hours for that day to 0. If all days are 0, deletes the line.
   */
  async deleteEntry(entryId: string): Promise<boolean> {
    if (!this._currentTimesheet) {
      throw new Error('No timesheet loaded. Please refresh the page.');
    }

    if (!this.isTimesheetEditable()) {
      const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
      throw new TimesheetNotEditableError(status);
    }

    const parsed = parseEntryId(entryId);
    if (!parsed) {
      throw new Error('Invalid entry ID format.');
    }

    const { lineId, dayIndex } = parsed;
    const line = this._currentTimesheetLines.find((l) => l.id === lineId);

    if (!line) {
      throw new Error('Timesheet line not found.');
    }

    // Check if this is the only day with hours
    let otherDaysHaveHours = false;
    for (let i = 1; i <= 7; i++) {
      if (i !== dayIndex) {
        const hours = (line[getQuantityField(i)] as number) || 0;
        if (hours > 0) {
          otherDaysHaveHours = true;
          break;
        }
      }
    }

    if (otherDaysHaveHours) {
      // Just zero out this day
      await bcClient.updateTimeSheetLine(
        lineId,
        { [getQuantityField(dayIndex)]: 0 },
        line['@odata.etag'] || '*'
      );

      // Update cache - set the quantity for this day to 0
      const lineIndex = this._currentTimesheetLines.findIndex((l) => l.id === lineId);
      if (lineIndex >= 0) {
        const cachedLine = this._currentTimesheetLines[lineIndex];
        const quantityKey = getQuantityField(dayIndex);
        (cachedLine as unknown as Record<string, number | undefined>)[quantityKey] = 0;
      }
    } else {
      // Delete the entire line
      await bcClient.deleteTimeSheetLine(lineId, line['@odata.etag'] || '*');

      // Remove from cache
      this._currentTimesheetLines = this._currentTimesheetLines.filter((l) => l.id !== lineId);
    }

    return true;
  },

  /**
   * Submit timesheet for approval.
   */
  async submitTimesheet(): Promise<void> {
    if (!this._currentTimesheet) {
      throw new Error('No timesheet loaded. Please refresh the page.');
    }

    await bcClient.submitTimeSheet(this._currentTimesheet.id);
    toast.success('Timesheet submitted for approval.');

    // Refresh timesheet to get updated status
    this._currentTimesheet = await bcClient.getTimeSheet(this._currentTimesheet.id);
  },

  /**
   * Reopen timesheet for editing.
   */
  async reopenTimesheet(): Promise<void> {
    if (!this._currentTimesheet) {
      throw new Error('No timesheet loaded. Please refresh the page.');
    }

    await bcClient.reopenTimeSheet(this._currentTimesheet.id);
    toast.success('Timesheet reopened for editing.');

    // Refresh timesheet to get updated status
    this._currentTimesheet = await bcClient.getTimeSheet(this._currentTimesheet.id);
  },

  /**
   * Copy entries from previous week.
   * Creates new lines in the current timesheet based on previous week's entries.
   */
  async copyFromPreviousWeek(
    previousWeekStart: Date,
    currentWeekStart: Date,
    userId: string
  ): Promise<TimeEntry[]> {
    // Get the user's resource number
    const resource = await bcClient.getResourceByEmail(userId);
    if (!resource) {
      throw new Error('Could not find your resource record in Business Central.');
    }

    // Get previous week's timesheet
    let previousTimesheet: BCTimeSheet;
    try {
      previousTimesheet = await this.getTimesheet(resource.number, previousWeekStart);
    } catch {
      toast.error('No timesheet found for previous week.');
      return [];
    }

    const previousLines = await bcClient.getTimeSheetLines(previousTimesheet.number);

    if (!this._currentTimesheet) {
      throw new Error('No current timesheet loaded.');
    }

    if (!this.isTimesheetEditable()) {
      const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
      throw new TimesheetNotEditableError(status);
    }

    const newEntries: TimeEntry[] = [];

    for (const prevLine of previousLines) {
      if (prevLine.type !== 'Job' || !prevLine.jobNo || !prevLine.jobTaskNo) {
        continue;
      }

      // Check if this project/task already exists in current week
      const existingLine = this._currentTimesheetLines.find(
        (l) => l.jobNo === prevLine.jobNo && l.jobTaskNo === prevLine.jobTaskNo
      );

      if (existingLine) {
        continue; // Skip - already have entries for this project/task
      }

      // Create new line with same daily pattern
      const newLine = await bcClient.createTimeSheetLine({
        timeSheetNo: this._currentTimesheet.number,
        type: 'Job',
        jobNo: prevLine.jobNo,
        jobTaskNo: prevLine.jobTaskNo,
        description: prevLine.description,
        quantity1: prevLine.quantity1,
        quantity2: prevLine.quantity2,
        quantity3: prevLine.quantity3,
        quantity4: prevLine.quantity4,
        quantity5: prevLine.quantity5,
        quantity6: prevLine.quantity6,
        quantity7: prevLine.quantity7,
      });

      this._currentTimesheetLines.push(newLine);

      // Convert to TimeEntry objects
      const lineEntries = bcLinesToTimeEntries([newLine], this._currentTimesheet, userId);
      newEntries.push(...lineEntries);
    }

    if (newEntries.length > 0) {
      toast.success(`Copied ${newEntries.length} entries from previous week.`);
    } else {
      toast.error('No entries to copy from previous week.');
    }

    return newEntries;
  },

  /**
   * Calculate total hours for a set of entries.
   */
  calculateTotalHours(entries: TimeEntry[]): number {
    return entries.reduce((sum, entry) => sum + entry.hours, 0);
  },

  /**
   * Get daily totals.
   */
  getDailyTotals(entries: TimeEntry[]): { [date: string]: number } {
    return entries.reduce(
      (totals, entry) => {
        totals[entry.date] = (totals[entry.date] || 0) + entry.hours;
        return totals;
      },
      {} as { [date: string]: number }
    );
  },

  /**
   * Get entries for a teammate from Business Central.
   */
  async getTeammateEntries(weekStart: Date, teammate: BCEmployee): Promise<TimeEntry[]> {
    try {
      // Get resource by employee email
      const resource = teammate.email ? await bcClient.getResourceByEmail(teammate.email) : null;

      if (!resource) {
        return [];
      }

      const timesheet = await this.getTimesheet(resource.number, weekStart);
      const lines = await bcClient.getTimeSheetLines(timesheet.number);

      return bcLinesToTimeEntries(lines, timesheet, teammate.id);
    } catch {
      return [];
    }
  },
};
