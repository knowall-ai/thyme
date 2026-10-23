import { bcClient } from './bcClient';
import type { Project, Task, BCProject, BCJobTask, BCJobPlanningLine } from '@/types';
import { compareProjectsByName } from '@/utils/projectSort';
import { getProjectCustomer, getProjectCustomerName } from '@/utils/projectCustomer';
import {
  buildUOMConversionMap,
  collectProjectTimeRows,
  emptyStageHours,
  getAbsenceTaskNos,
  getBillingModeFromLines,
  getStageHoursByProject,
  isInternalProject,
  sumEstimateHours,
  sumPlannedHours,
  withoutAbsenceLines,
  type BillingMode,
  type StageHours,
} from '@/utils';

/** A project's figures for the Projects list, worked out as on the project page */
export interface ProjectFigures {
  timeByStage: StageHours; // Time Spent, split by timesheet stage
  estimateHours: number; // Quoted on Billable Resource lines: the budget
  plannedHours: number; // On Budget Resource lines (the Plan)
  billingMode: BillingMode;
}

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

// Latch so the older-extension warning logs once per session.
let warnedNoBlockedField = false;

/**
 * Warn (once per session) if no project in the response carries a `blocked`
 * field. That signals the Thyme BC Extension is older than the version that
 * exposes `blocked` on /projects, in which case archived projects will fall
 * through to "active" and the hide-archived feature won't apply.
 */
function warnIfBlockedFieldMissing(bcProjects: BCProject[]): void {
  if (warnedNoBlockedField || bcProjects.length === 0) return;
  const anyHasBlocked = bcProjects.some((p) => p.blocked !== undefined);
  if (!anyHasBlocked) {
    warnedNoBlockedField = true;
    console.warn(
      '[Thyme] No project returned a `blocked` field. Archived projects will not be hidden — ' +
        'install the latest Thyme BC Extension to enable the hide-archived feature.'
    );
  }
}

// The Thyme BC Extension API (v1.7+) returns displayName, billToCustomerName and status fields,
// and (v1.27.0.1+) sellToCustomerName.

function mapBCProjectToProject(bcProject: BCProject, index: number, favorites: string[]): Project {
  // Map BC status to Thyme status — blocked projects are archived
  const isBlocked = bcProject.blocked && bcProject.blocked !== ' ';
  const status: Project['status'] = isBlocked
    ? 'archived'
    : bcProject.status === 'Completed'
      ? 'completed'
      : 'active';

  return {
    id: bcProject.id,
    code: bcProject.number,
    name: bcProject.displayName || bcProject.number,
    customerNo: getProjectCustomer(bcProject).number || undefined,
    customerName: getProjectCustomerName(bcProject) || 'Unknown',
    isInternal: isInternalProject(bcProject),
    color: getProjectColor(index),
    status,
    isFavorite: favorites.includes(bcProject.id),
    tasks: [],
    startDate: bcProject.startingDate,
    endDate: bcProject.endingDate,
  };
}

function mapBCJobTaskToTask(jobTask: BCJobTask, projectId: string, isInternal: boolean): Task {
  return {
    id: jobTask.id,
    projectId,
    code: jobTask.jobTaskNo,
    name: jobTask.description,
    // Internal projects' time is never billable
    isBillable: jobTask.jobTaskType === 'Posting' && !isInternal,
  };
}

// How long the shared projects list is reused for billable lookups before refetching
const PROJECTS_CACHE_TTL_MS = 5 * 60 * 1000;

// One in-flight/recent /projects request per company, shared by every billable lookup
// so mapping time entries doesn't refetch projects per user or per timesheet
let projectsCache: { key: string; fetchedAt: number; promise: Promise<BCProject[]> } | null = null;

function projectsCacheKey(): string {
  return `${bcClient.environment}|${bcClient.companyId}`;
}

async function loadBCProjects(forceRefresh = false): Promise<BCProject[]> {
  const key = projectsCacheKey();
  if (
    !forceRefresh &&
    projectsCache?.key === key &&
    Date.now() - projectsCache.fetchedAt < PROJECTS_CACHE_TTL_MS
  ) {
    return projectsCache.promise;
  }

  const promise = bcClient.getProjects();
  const entry = { key, fetchedAt: Date.now(), promise };
  projectsCache = entry;
  // Don't keep a failed request around - the next lookup should retry
  promise.catch(() => {
    if (projectsCache === entry) projectsCache = null;
  });
  return promise;
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
    // Always fetch fresh here; the result also refreshes the billable lookup cache
    const bcProjects = await loadBCProjects(true);
    warnIfBlockedFieldMissing(bcProjects);
    const favorites = getFavorites();

    // Map first so each project keeps its colour, then list them alphabetically
    return bcProjects
      .map((bcProject, index) => mapBCProjectToProject(bcProject, index, favorites))
      .sort(compareProjectsByName);
  },

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const bcProject = await bcClient.getProject(projectId);
      const favorites = getFavorites();
      const project = mapBCProjectToProject(bcProject, 0, favorites);

      // Also fetch tasks
      const tasks = await this.getProjectTasks(project.code, project.isInternal);
      project.tasks = tasks;

      return project;
    } catch {
      return null;
    }
  },

  async getProjectTasks(projectCode: string, isInternal = false): Promise<Task[]> {
    const jobTasks = await bcClient.getJobTasks(projectCode);

    // Filter to only posting tasks (the ones time can be booked against)
    const postingTasks = jobTasks.filter((task) => task.jobTaskType === 'Posting');

    return postingTasks.map((task) => mapBCJobTaskToTask(task, projectCode, isInternal));
  },

  /**
   * BC projects keyed by project number, for working out whether time is billable
   * (see isBillableEntry). Reuses one recent /projects response per company rather
   * than fetching per user or timesheet.
   */
  async getProjectsByNumber(): Promise<Map<string, BCProject>> {
    const bcProjects = await loadBCProjects();
    return new Map(bcProjects.map((p) => [p.number, p]));
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
   * Time spent (split by stage), Estimate, Plan and billing mode for every project, worked
   * out exactly as the project page does (see projectDetailsService.getProjectAnalytics)
   * with the same shared helpers, so the list and the project page show the same figures.
   *
   * Every project at once: a handful of company-wide queries (each paged), rather than
   * walking every person's timesheets or loading each project separately. Projects need
   * their tasks loaded (fetchProjects does), to leave planned absence out of the estimate.
   * A timesheet query failing rejects the whole load, so the list never shows zero hours
   * that look real; posted hours and planning lines fall back to none, as on the project page.
   */
  async getProjectFigures(
    projects: Pick<Project, 'code' | 'isInternal' | 'tasks'>[]
  ): Promise<Map<string, ProjectFigures>> {
    const figures = new Map<string, ProjectFigures>();
    if (projects.length === 0) return figures;

    const [resources, timesheets, jobLines, jobDetails, planningLines, uoms] = await Promise.all([
      bcClient.getResources(),
      bcClient.getTimeSheetsFrom(),
      bcClient.getAllJobTimeSheetLines(),
      bcClient.getAllJobTimeSheetDetails(),
      bcClient.getAllJobPlanningLines().catch(() => []),
      bcClient.getResourceUnitsOfMeasure(),
    ]);

    // Time Spent by stage, by the project page's rules
    const resourceNoByTimesheet = new Map(timesheets.map((ts) => [ts.number, ts.resourceNo]));
    const timeRows = collectProjectTimeRows(
      jobLines,
      jobDetails,
      resourceNoByTimesheet,
      new Set(resources.map((r) => r.number))
    );
    const stagesByProject = getStageHoursByProject(timeRows);

    // Estimate and Plan from each project's planning lines, less planned absence on
    // non-internal projects (internal ones have no budget; their plan is kept as is)
    const uomConversionMap = buildUOMConversionMap(uoms);
    const linesByProject = new Map<string, BCJobPlanningLine[]>();
    for (const line of planningLines) {
      const lines = linesByProject.get(line.jobNo) ?? [];
      lines.push(line);
      linesByProject.set(line.jobNo, lines);
    }

    for (const project of projects) {
      const isInternal = !!project.isInternal;
      const absenceTaskNos = getAbsenceTaskNos(
        project.tasks.map((task) => ({ jobTaskNo: task.code, description: task.name }))
      );
      const lines = withoutAbsenceLines(
        linesByProject.get(project.code) ?? [],
        absenceTaskNos,
        isInternal
      );
      figures.set(project.code, {
        timeByStage: stagesByProject.get(project.code) ?? emptyStageHours(),
        estimateHours: sumEstimateHours(lines, uomConversionMap),
        plannedHours: sumPlannedHours(lines, uomConversionMap),
        billingMode: getBillingModeFromLines(lines),
      });
    }
    return figures;
  },
};
