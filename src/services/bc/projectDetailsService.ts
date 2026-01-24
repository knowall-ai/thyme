import { bcClient } from './bcClient';
import type { Project, Task, BCTimeSheet, BCTimeSheetLine } from '@/types';
import { getWeekStart } from '@/utils';

// Color palette for projects (same as projectService)
const PROJECT_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export interface ProjectAnalytics {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  hoursThisWeek: number;
  teamMemberCount: number;
  weeklyData: WeeklyDataPoint[];
  taskBreakdown: TaskBreakdownItem[];
  teamBreakdown: TeamBreakdownItem[];
}

interface WeeklyDataPoint {
  week: string; // ISO week format: "2024-W01"
  hours: number;
  cumulative: number;
}

interface TaskBreakdownItem {
  taskNo: string;
  description: string;
  hours: number;
  teamMembers?: { name: string; hours: number }[];
}

interface TeamBreakdownItem {
  resourceNo: string;
  name: string;
  hours: number;
  tasks?: { taskNo: string; description: string; hours: number }[];
}

// Local storage key for favorites (shared with projectService)
const FAVORITES_KEY = 'thyme_favorite_projects';

function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FAVORITES_KEY);
  return stored ? JSON.parse(stored) : [];
}

/**
 * Get ISO week string from a date
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const projectDetailsService = {
  /**
   * Fetch project details and tasks by project number
   */
  async getProjectDetails(projectNumber: string): Promise<{ project: Project; tasks: Task[] }> {
    // Fetch the project from BC - use jobs endpoint which has more details
    const jobs = await bcClient.getJobs(`number eq '${projectNumber.replace(/'/g, "''")}'`);

    if (jobs.length === 0) {
      throw new Error(`Project ${projectNumber} not found`);
    }

    const job = jobs[0];
    const favorites = getFavorites();

    const project: Project = {
      id: job.id,
      code: job.number,
      name: job.description,
      customerName: job.billToCustomerName || 'Unknown',
      color: PROJECT_COLORS[job.number.charCodeAt(0) % PROJECT_COLORS.length],
      status:
        job.status === 'Open' ? 'active' : job.status === 'Completed' ? 'completed' : 'active',
      isFavorite: favorites.includes(job.id),
      tasks: [],
    };

    // Fetch tasks
    const jobTasks = await bcClient.getJobTasks(projectNumber);
    const postingTasks = jobTasks.filter((task) => task.jobTaskType === 'Posting');

    const tasks: Task[] = postingTasks.map((task) => ({
      id: task.id,
      projectId: project.id,
      code: task.jobTaskNo,
      name: task.description,
      isBillable: true, // Posting tasks are billable
    }));

    project.tasks = tasks;

    return { project, tasks };
  },

  /**
   * Fetch and aggregate analytics data for a project
   * This fetches timesheet data from all resources who have worked on the project
   */
  async getProjectAnalytics(projectNumber: string): Promise<ProjectAnalytics> {
    // Check if extension is installed
    const extensionInstalled = await bcClient.isExtensionInstalled();
    if (!extensionInstalled) {
      return {
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        hoursThisWeek: 0,
        teamMemberCount: 0,
        weeklyData: [],
        taskBreakdown: [],
        teamBreakdown: [],
      };
    }

    // Get all resources (team members)
    let resources;
    try {
      resources = await bcClient.getResources();
    } catch {
      // If resources can't be fetched, return empty analytics
      return {
        totalHours: 0,
        billableHours: 0,
        nonBillableHours: 0,
        hoursThisWeek: 0,
        teamMemberCount: 0,
        weeklyData: [],
        taskBreakdown: [],
        teamBreakdown: [],
      };
    }

    // Collect all time entries for this project
    interface TimeEntryData {
      resourceNo: string;
      resourceName: string;
      taskNo: string;
      description: string;
      hours: number;
      date: string;
      weekStart: string;
    }

    const timeEntries: TimeEntryData[] = [];
    const teamMembersSet = new Set<string>();

    // Get the date 6 months ago for filtering
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const filterDate = sixMonthsAgo.toISOString().split('T')[0];

    // Fetch timesheets for each resource
    const timesheetPromises = resources.map(async (resource) => {
      try {
        // Get timesheets for this resource from the last 6 months
        const timesheets = await bcClient.getTimeSheets(resource.number);

        // Filter to timesheets that started after our filter date
        const recentTimesheets = timesheets.filter(
          (ts: BCTimeSheet) => ts.startingDate >= filterDate
        );

        // For each timesheet, get lines filtered by project
        for (const timesheet of recentTimesheets) {
          try {
            const lines = await bcClient.getTimeSheetLines(timesheet.number);

            // Filter lines for this project
            const projectLines = lines.filter(
              (line: BCTimeSheetLine) => line.type === 'Job' && line.jobNo === projectNumber
            );

            // Get details for each line to get daily hours
            for (const line of projectLines) {
              if (line.totalQuantity > 0) {
                teamMembersSet.add(resource.number);

                // Get the line details for daily breakdown
                const details = await bcClient.getTimeSheetDetails(timesheet.number, line.lineNo);

                for (const detail of details) {
                  if (detail.quantity > 0) {
                    const detailDate = new Date(detail.date);
                    timeEntries.push({
                      resourceNo: resource.number,
                      resourceName: resource.name || resource.number,
                      taskNo: line.jobTaskNo || '',
                      description: line.description || '',
                      hours: detail.quantity,
                      date: detail.date,
                      weekStart: getISOWeek(detailDate),
                    });
                  }
                }
              }
            }
          } catch {
            // Skip timesheet if lines can't be fetched
          }
        }
      } catch {
        // Skip resource if timesheets can't be fetched
      }
    });

    await Promise.all(timesheetPromises);

    // Calculate analytics from collected data
    const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);

    // For now, assume all hours are billable (BC doesn't expose this easily)
    const billableHours = totalHours;
    const nonBillableHours = 0;

    // Hours this week
    const currentWeekStart = getWeekStart(new Date());
    const currentWeekStr = getISOWeek(currentWeekStart);
    const hoursThisWeek = timeEntries
      .filter((e) => e.weekStart === currentWeekStr)
      .reduce((sum, e) => sum + e.hours, 0);

    // Weekly data aggregation
    const weeklyMap = new Map<string, number>();
    for (const entry of timeEntries) {
      const current = weeklyMap.get(entry.weekStart) || 0;
      weeklyMap.set(entry.weekStart, current + entry.hours);
    }

    // Sort weeks and calculate cumulative
    const sortedWeeks = Array.from(weeklyMap.keys()).sort();
    let cumulative = 0;
    const weeklyData: WeeklyDataPoint[] = sortedWeeks.map((week) => {
      const hours = weeklyMap.get(week) || 0;
      cumulative += hours;
      return { week, hours, cumulative };
    });

    // Task breakdown
    const taskMap = new Map<
      string,
      { description: string; hours: number; members: Map<string, number> }
    >();
    for (const entry of timeEntries) {
      const key = entry.taskNo || 'no-task';
      if (!taskMap.has(key)) {
        taskMap.set(key, {
          description: entry.description || 'Unknown Task',
          hours: 0,
          members: new Map(),
        });
      }
      const task = taskMap.get(key)!;
      task.hours += entry.hours;

      const memberHours = task.members.get(entry.resourceName) || 0;
      task.members.set(entry.resourceName, memberHours + entry.hours);
    }

    const taskBreakdown: TaskBreakdownItem[] = Array.from(taskMap.entries())
      .map(([taskNo, data]) => ({
        taskNo,
        description: data.description,
        hours: data.hours,
        teamMembers: Array.from(data.members.entries())
          .map(([name, hours]) => ({ name, hours }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours);

    // Team breakdown
    const teamMap = new Map<
      string,
      { name: string; hours: number; tasks: Map<string, { description: string; hours: number }> }
    >();
    for (const entry of timeEntries) {
      if (!teamMap.has(entry.resourceNo)) {
        teamMap.set(entry.resourceNo, {
          name: entry.resourceName,
          hours: 0,
          tasks: new Map(),
        });
      }
      const member = teamMap.get(entry.resourceNo)!;
      member.hours += entry.hours;

      const taskKey = entry.taskNo || 'no-task';
      if (!member.tasks.has(taskKey)) {
        member.tasks.set(taskKey, { description: entry.description || 'Unknown Task', hours: 0 });
      }
      const task = member.tasks.get(taskKey)!;
      task.hours += entry.hours;
    }

    const teamBreakdown: TeamBreakdownItem[] = Array.from(teamMap.entries())
      .map(([resourceNo, data]) => ({
        resourceNo,
        name: data.name,
        hours: data.hours,
        tasks: Array.from(data.tasks.entries())
          .map(([taskNo, taskData]) => ({
            taskNo,
            description: taskData.description,
            hours: taskData.hours,
          }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours);

    return {
      totalHours,
      billableHours,
      nonBillableHours,
      hoursThisWeek,
      teamMemberCount: teamMembersSet.size,
      weeklyData,
      taskBreakdown,
      teamBreakdown,
    };
  },
};
