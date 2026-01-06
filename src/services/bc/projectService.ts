import { bcClient } from './bcClient';
import type { Project, Task, BCJob, BCJobTask } from '@/types';

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

function mapBCJobToProject(bcJob: BCJob, index: number, favorites: string[]): Project {
  return {
    id: bcJob.id,
    code: bcJob.number,
    name: bcJob.description,
    customerName: bcJob.billToCustomerName || undefined,
    color: getProjectColor(index),
    status: bcJob.status === 'Completed' ? 'completed' : 'active',
    isFavorite: favorites.includes(bcJob.id),
    tasks: [],
  };
}

function mapBCJobTaskToTask(jobTask: BCJobTask, projectId: string): Task {
  return {
    id: jobTask.id,
    projectId,
    code: jobTask.taskNumber,
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
    // Use Jobs API instead of Projects to get customer info (billToCustomerName)
    const bcJobs = await bcClient.getJobs();
    const favorites = getFavorites();

    return bcJobs.map((bcJob, index) => mapBCJobToProject(bcJob, index, favorites));
  },

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const bcJob = await bcClient.getJob(projectId);
      const favorites = getFavorites();
      const project = mapBCJobToProject(bcJob, 0, favorites);

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
};
