import toast from 'react-hot-toast';
import { bcClient } from './bcClient';
import type {
  TimeEntry,
  BCTimeSheet,
  BCTimeSheetLine,
  BCTimeSheetDetail,
  BCEmployee,
} from '@/types';
import { format, startOfWeek } from 'date-fns';

// Error thrown when no resource record exists in BC for the user
export class NoResourceError extends Error {
  userEmail: string;

  constructor(userEmail: string) {
    super(
      `No Resource record found in Business Central for email "${userEmail}". A Resource record must be created before you can use Thyme.`
    );
    this.name = 'NoResourceError';
    this.userEmail = userEmail;
  }
}

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
 * Create a composite entry ID from line ID and date.
 * Format: {lineId}_{date}
 */
function createEntryId(lineId: string, date: string): string {
  return `${lineId}_${date}`;
}

/**
 * Parse a composite entry ID to get line ID and date.
 */
function parseEntryId(entryId: string): { lineId: string; date: string } | null {
  // Format: {lineId}_{date} where date is YYYY-MM-DD
  // lineId is a GUID, date is 10 chars
  const dateMatch = entryId.match(/_(\d{4}-\d{2}-\d{2})$/);
  if (!dateMatch) return null;

  const date = dateMatch[1];
  const lineId = entryId.substring(0, entryId.length - date.length - 1);

  return { lineId, date };
}

/**
 * Convert BC Timesheet Lines and Details to TimeEntry objects.
 * Each detail record becomes one TimeEntry.
 */
function bcDataToTimeEntries(
  lines: BCTimeSheetLine[],
  details: BCTimeSheetDetail[],
  _timesheet: BCTimeSheet,
  userId: string
): TimeEntry[] {
  const entries: TimeEntry[] = [];

  // Create a map of lineNo -> line for quick lookup
  const lineByNo = new Map<number, BCTimeSheetLine>();
  const lineById = new Map<string, BCTimeSheetLine>();
  for (const line of lines) {
    lineByNo.set(line.lineNo, line);
    lineById.set(line.id, line);
  }

  for (const detail of details) {
    const line = lineByNo.get(detail.timeSheetLineNo);
    if (!line || line.type !== 'Job' || !line.jobNo || !line.jobTaskNo) {
      continue; // Skip non-job lines or orphan details
    }

    if (detail.quantity > 0) {
      entries.push({
        id: createEntryId(line.id, detail.date), // Composite ID: lineId_date
        projectId: line.jobNo,
        taskId: line.jobTaskNo,
        userId,
        date: detail.date,
        hours: detail.quantity,
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

  return entries;
}

export const timeEntryService = {
  /**
   * Current timesheet for the active week (cached per fetch).
   */
  _currentTimesheet: null as BCTimeSheet | null,
  _currentTimesheetLines: [] as BCTimeSheetLine[],
  _currentTimesheetDetails: [] as BCTimeSheetDetail[],

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
      throw new NoResourceError(userId);
    }

    // Get the week start (BC timesheets are weekly)
    const weekStart = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday

    try {
      const timesheet = await this.getTimesheet(resource.number, weekStart);
      const [lines, details] = await Promise.all([
        bcClient.getTimeSheetLines(timesheet.number),
        bcClient.getAllTimeSheetDetails(timesheet.number),
      ]);

      // Cache for later operations
      this._currentTimesheet = timesheet;
      this._currentTimesheetLines = lines;
      this._currentTimesheetDetails = details;

      return bcDataToTimeEntries(lines, details, timesheet, userId);
    } catch (error) {
      if (error instanceof NoTimesheetError || error instanceof NoResourceError) {
        // Clear cache
        this._currentTimesheet = null;
        this._currentTimesheetLines = [];
        this._currentTimesheetDetails = [];
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
   * Creates a timesheet line if needed, then sets hours for the date.
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

    // Check if a line already exists for this project/task
    let line = this._currentTimesheetLines.find(
      (l) => l.jobNo === entry.projectId && l.jobTaskNo === entry.taskId
    );

    if (!line) {
      // Create new line for this project/task
      line = await bcClient.createTimeSheetLine({
        timeSheetNo: this._currentTimesheet.number,
        type: 'Job',
        jobNo: entry.projectId,
        jobTaskNo: entry.taskId,
        description: entry.notes || undefined,
      });

      // Update cache
      this._currentTimesheetLines.push(line);
    }

    // Check if hours already exist for this line and date
    const existingDetail = this._currentTimesheetDetails.find(
      (d) => d.timeSheetLineNo === line!.lineNo && d.date === entry.date
    );

    // Calculate new hours (add to existing if any)
    const existingHours = existingDetail?.quantity || 0;
    const newHours = existingHours + entry.hours;

    // Set hours for the date using the bound action
    await bcClient.setHoursForDate(line.id, entry.date, newHours);

    // Update the detail cache
    if (existingDetail) {
      existingDetail.quantity = newHours;
    } else {
      // Add a new detail to cache
      this._currentTimesheetDetails.push({
        id: `temp_${line.id}_${entry.date}`, // Temporary ID, will be refreshed on next load
        timeSheetNo: this._currentTimesheet.number,
        timeSheetLineNo: line.lineNo,
        date: entry.date,
        quantity: newHours,
      });
    }

    return {
      id: createEntryId(line.id, entry.date),
      projectId: entry.projectId,
      taskId: entry.taskId,
      userId: entry.userId,
      date: entry.date,
      hours: newHours,
      notes: entry.notes,
      isBillable: entry.isBillable,
      isRunning: entry.isRunning,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bcTimeSheetLineId: line.id,
      bcTimeSheetNo: line.timeSheetNo,
      lineStatus: line.status,
    };
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

    const { lineId, date } = parsed;

    // Find the line
    const line = this._currentTimesheetLines.find((l) => l.id === lineId);
    if (!line) {
      throw new Error('Timesheet line not found.');
    }

    // Update hours if provided
    if (updates.hours !== undefined) {
      await bcClient.setHoursForDate(lineId, date, updates.hours);

      // Update cache
      const detail = this._currentTimesheetDetails.find(
        (d) => d.timeSheetLineNo === line.lineNo && d.date === date
      );
      if (detail) {
        detail.quantity = updates.hours;
      }
    }

    // Update line description if notes changed
    if (updates.notes !== undefined && updates.notes !== line.description) {
      const updatedLine = await bcClient.updateTimeSheetLine(
        line.id,
        { description: updates.notes },
        line['@odata.etag'] || '*'
      );
      const lineIndex = this._currentTimesheetLines.findIndex((l) => l.id === line.id);
      if (lineIndex >= 0) {
        this._currentTimesheetLines[lineIndex] = updatedLine;
      }
    }

    // Return only updated fields - userId is preserved from original entry by store
    return {
      id: entryId,
      projectId: line.jobNo || '',
      taskId: line.jobTaskNo || '',
      date: date,
      hours: updates.hours ?? 0,
      notes: updates.notes ?? line.description,
      isBillable: true,
      isRunning: false,
      updatedAt: new Date().toISOString(),
      bcTimeSheetLineId: line.id,
      bcTimeSheetNo: line.timeSheetNo,
      lineStatus: line.status,
    } as TimeEntry;
  },

  /**
   * Delete an entry.
   * Sets hours to 0 for the date. If no other hours exist on the line, deletes the line too.
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

    const { lineId, date } = parsed;

    // Find the line
    const line = this._currentTimesheetLines.find((l) => l.id === lineId);
    if (!line) {
      throw new Error('Timesheet line not found.');
    }

    // Set hours to 0 for this date
    await bcClient.setHoursForDate(lineId, date, 0);

    // Update cache - remove the detail
    this._currentTimesheetDetails = this._currentTimesheetDetails.filter(
      (d) => !(d.timeSheetLineNo === line.lineNo && d.date === date)
    );

    // Check if any other hours exist for this line
    const otherDetails = this._currentTimesheetDetails.filter(
      (d) => d.timeSheetLineNo === line.lineNo && d.quantity > 0
    );

    if (otherDetails.length === 0) {
      // Delete the line too
      await bcClient.deleteTimeSheetLine(line.id, line['@odata.etag'] || '*');
      this._currentTimesheetLines = this._currentTimesheetLines.filter((l) => l.id !== line.id);
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
   * Creates new lines and sets hours in the current timesheet based on previous week's entries.
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

    const [previousLines, previousDetails] = await Promise.all([
      bcClient.getTimeSheetLines(previousTimesheet.number),
      bcClient.getAllTimeSheetDetails(previousTimesheet.number),
    ]);

    if (!this._currentTimesheet) {
      throw new Error('No current timesheet loaded.');
    }

    if (!this.isTimesheetEditable()) {
      const status = bcClient.getTimesheetDisplayStatus(this._currentTimesheet);
      throw new TimesheetNotEditableError(status);
    }

    const newEntries: TimeEntry[] = [];

    // Calculate the day offset between weeks (in days)
    const dayOffset = Math.round(
      (currentWeekStart.getTime() - previousWeekStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (const prevLine of previousLines) {
      if (prevLine.type !== 'Job' || !prevLine.jobNo || !prevLine.jobTaskNo) {
        continue;
      }

      // Check if this project/task already exists in current week
      let currentLine = this._currentTimesheetLines.find(
        (l) => l.jobNo === prevLine.jobNo && l.jobTaskNo === prevLine.jobTaskNo
      );

      if (!currentLine) {
        // Create new line
        currentLine = await bcClient.createTimeSheetLine({
          timeSheetNo: this._currentTimesheet.number,
          type: 'Job',
          jobNo: prevLine.jobNo,
          jobTaskNo: prevLine.jobTaskNo,
          description: prevLine.description,
        });
        this._currentTimesheetLines.push(currentLine);
      }

      // Copy hours for each day from previous week
      const lineDetails = previousDetails.filter((d) => d.timeSheetLineNo === prevLine.lineNo);

      for (const prevDetail of lineDetails) {
        if (prevDetail.quantity <= 0) continue;

        // Calculate new date (same day of week in current week)
        const prevDate = new Date(prevDetail.date);
        const newDate = new Date(prevDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const newDateStr = format(newDate, 'yyyy-MM-dd');

        // Check if hours already exist for this date
        const existingDetail = this._currentTimesheetDetails.find(
          (d) => d.timeSheetLineNo === currentLine!.lineNo && d.date === newDateStr
        );

        if (existingDetail && existingDetail.quantity > 0) {
          continue; // Skip - already have hours for this date
        }

        // Set hours for the date
        await bcClient.setHoursForDate(currentLine.id, newDateStr, prevDetail.quantity);

        // Update cache
        if (existingDetail) {
          existingDetail.quantity = prevDetail.quantity;
        } else {
          this._currentTimesheetDetails.push({
            id: `temp_${currentLine.id}_${newDateStr}`,
            timeSheetNo: this._currentTimesheet.number,
            timeSheetLineNo: currentLine.lineNo,
            date: newDateStr,
            quantity: prevDetail.quantity,
          });
        }

        newEntries.push({
          id: createEntryId(currentLine.id, newDateStr),
          projectId: currentLine.jobNo || '',
          taskId: currentLine.jobTaskNo || '',
          userId,
          date: newDateStr,
          hours: prevDetail.quantity,
          notes: currentLine.description,
          isBillable: true,
          isRunning: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          bcTimeSheetLineId: currentLine.id,
          bcTimeSheetNo: currentLine.timeSheetNo,
          lineStatus: currentLine.status,
        });
      }
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
      const [lines, details] = await Promise.all([
        bcClient.getTimeSheetLines(timesheet.number),
        bcClient.getAllTimeSheetDetails(timesheet.number),
      ]);

      return bcDataToTimeEntries(lines, details, timesheet, teammate.id);
    } catch (error) {
      // Log error for debugging but don't expose to user
      // This can fail for various reasons: no timesheet, no resource, network issues
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to get teammate entries:', {
          weekStart,
          teammateId: teammate.id,
          teammateEmail: teammate.email,
          error,
        });
      }
      return [];
    }
  },
};
