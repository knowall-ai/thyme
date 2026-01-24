import { bcClient } from './bcClient';
import type {
  Project,
  Task,
  BCProject,
  BCJobTask,
  BCTimeSheet,
  BCTimeSheetLine,
  BCJobPlanningLine,
} from '@/types';

// Color palette for projects
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

function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

// The Thyme BC Extension API (v1.7+) returns displayName, billToCustomerName and status fields.

function mapBCProjectToProject(bcProject: BCProject, index: number, favorites: string[]): Project {
  // Map BC status to Thyme status
  const status: 'active' | 'completed' = bcProject.status === 'Completed' ? 'completed' : 'active';

  return {
    id: bcProject.id,
    code: bcProject.number,
    name: bcProject.displayName || bcProject.number,
    customerName: bcProject.billToCustomerName || 'Unknown',
    color: getProjectColor(index),
    status,
    isFavorite: favorites.includes(bcProject.id),
    tasks: [],
  };
}

function mapBCJobTaskToTask(jobTask: BCJobTask, projectId: string): Task {
  return {
    id: jobTask.id,
    projectId,
    code: jobTask.jobTaskNo,
    name: jobTask.description,
    isBillable: jobTask.jobTaskType === 'Posting',
  };
}

// Local storage key for favorites
const FAVORITES_KEY = 'thyme_favorite_projects';

function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(FAVORITES_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveFavorites(favorites: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export const projectService = {
  async getProjects(_includeCompleted = false): Promise<Project[]> {
    const bcProjects = await bcClient.getProjects();
    const favorites = getFavorites();

    return bcProjects.map((bcProject, index) => mapBCProjectToProject(bcProject, index, favorites));
  },

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const bcProject = await bcClient.getProject(projectId);
      const favorites = getFavorites();
      const project = mapBCProjectToProject(bcProject, 0, favorites);

      // Also fetch tasks
      const tasks = await this.getProjectTasks(project.code);
      project.tasks = tasks;

      return project;
    } catch {
      return null;
    }
  },

  async getProjectTasks(projectCode: string): Promise<Task[]> {
    const jobTasks = await bcClient.getJobTasks(projectCode);

    // Filter to only posting tasks (billable tasks)
    const postingTasks = jobTasks.filter((task) => task.jobTaskType === 'Posting');

    return postingTasks.map((task) => mapBCJobTaskToTask(task, projectCode));
  },

  async searchProjects(query: string): Promise<Project[]> {
    const allProjects = await this.getProjects();
    const lowerQuery = query.toLowerCase();

    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(lowerQuery) ||
        project.code.toLowerCase().includes(lowerQuery) ||
        project.customerName?.toLowerCase().includes(lowerQuery)
    );
  },

  toggleFavorite(projectId: string): boolean {
    const favorites = getFavorites();
    const index = favorites.indexOf(projectId);

    if (index > -1) {
      favorites.splice(index, 1);
      saveFavorites(favorites);
      return false;
    } else {
      favorites.push(projectId);
      saveFavorites(favorites);
      return true;
    }
  },

  getFavoriteProjects(projects: Project[]): Project[] {
    return projects.filter((p) => p.isFavorite);
  },

  getRecentProjects(projects: Project[], limit = 5): Project[] {
    // In a real implementation, this would track usage history
    // For now, just return favorites + first few projects
    const favorites = projects.filter((p) => p.isFavorite);
    const nonFavorites = projects.filter((p) => !p.isFavorite);
    return [...favorites, ...nonFavorites].slice(0, limit);
  },

  /**
   * Fetch total hours for all projects by aggregating timesheet data.
   * Returns a map of project code -> total hours.
   * This is an expensive operation - call in the background.
   */
  async getProjectHours(): Promise<Map<string, number>> {
    const projectHours = new Map<string, number>();

    // Check if extension is installed
    const extensionInstalled = await bcClient.isExtensionInstalled();
    if (!extensionInstalled) {
      return projectHours;
    }

    // Get all resources
    let resources;
    try {
      resources = await bcClient.getResources();
    } catch {
      return projectHours;
    }

    // Get the date 6 months ago for filtering
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const filterDate = sixMonthsAgo.toISOString().split('T')[0];

    // Fetch timesheets for each resource and aggregate by project
    const timesheetPromises = resources.map(async (resource) => {
      try {
        const timesheets = await bcClient.getTimeSheets(resource.number);
        const recentTimesheets = timesheets.filter(
          (ts: BCTimeSheet) => ts.startingDate >= filterDate
        );

        for (const timesheet of recentTimesheets) {
          try {
            const lines = await bcClient.getTimeSheetLines(timesheet.number);
            const jobLines = lines.filter(
              (line: BCTimeSheetLine) => line.type === 'Job' && line.jobNo
            );

            for (const line of jobLines) {
              if (line.totalQuantity > 0 && line.jobNo) {
                const current = projectHours.get(line.jobNo) || 0;
                projectHours.set(line.jobNo, current + line.totalQuantity);
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
    return projectHours;
  },

  /**
   * Fetch budget hours for all projects from Job Planning Lines.
   * Returns a map of project code -> budget hours.
   */
  async getProjectBudgets(projectCodes: string[]): Promise<Map<string, number>> {
    const projectBudgets = new Map<string, number>();

    // Fetch budget for each project in parallel
    const budgetPromises = projectCodes.map(async (projectCode) => {
      try {
        const planningLines = await bcClient.getJobPlanningLines(projectCode);

        // Sum quantity for Resource type lines (hours-based budgets)
        const budgetHours = planningLines
          .filter((line: BCJobPlanningLine) => line.type === 'Resource')
          .reduce((sum: number, line: BCJobPlanningLine) => sum + line.quantity, 0);

        if (budgetHours > 0) {
          projectBudgets.set(projectCode, budgetHours);
        }
      } catch {
        // Skip project if budget can't be fetched
      }
    });

    await Promise.all(budgetPromises);
    return projectBudgets;
  },
};
