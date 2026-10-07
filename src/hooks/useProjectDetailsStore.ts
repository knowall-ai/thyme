import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectDetailsService, type ProjectAnalytics } from '@/services/bc/projectDetailsService';
import { bcClient } from '@/services/bc/bcClient';
import { useProjectsStore } from './useProjectsStore';
import { usePlanStore } from './usePlanStore';

// BC Job Description is Text[100]
export const PROJECT_NAME_MAX_LENGTH = 100;

// BC rejects writes the user's permission sets don't allow with a 403, or an error naming the missing permission
function isPermissionError(message: string): boolean {
  return /\(403\)/.test(message) || /permission/i.test(message);
}

// Thrown when BC refuses a rename, so the UI can revert rather than offer a retry
export class ProjectRenamePermissionError extends Error {
  constructor() {
    super("You don't have permission to rename projects in Business Central");
    this.name = 'ProjectRenamePermissionError';
  }
}

interface ProjectDetailsStore {
  // State
  project: Project | null;
  tasks: Task[];
  analytics: ProjectAnalytics | null;
  currencyCode: string; // From BC companyInformation
  isLoading: boolean;
  isLoadingAnalytics: boolean;
  error: string | null;

  // UI State
  chartView: 'weekly' | 'progress';
  tableGroupBy: 'task' | 'team';
  hiddenKpis: string[]; // KPI card labels whose amounts are masked via their Eye toggle (also drives the chart and PDF)

  // Actions
  /** force: refetch the loaded project (e.g. after its plan changed), keeping the page up */
  fetchProjectDetails: (projectNumber: string, options?: { force?: boolean }) => Promise<void>;
  renameProject: (name: string) => Promise<void>;
  setChartView: (view: 'weekly' | 'progress') => void;
  setTableGroupBy: (groupBy: 'task' | 'team') => void;
  toggleKpiHidden: (label: string) => void;
  clearProject: () => void;
}

// In-flight loads by project, so concurrent calls for the same project (e.g. React
// re-running the page effect) share one set of BC requests instead of each fetching everything
const inFlight = new Map<string, Promise<void>>();

export const useProjectDetailsStore = create<ProjectDetailsStore>((set, get) => ({
  // Initial state
  project: null,
  tasks: [],
  analytics: null,
  currencyCode: 'GBP', // Default, will be overwritten from BC
  isLoading: false,
  isLoadingAnalytics: false,
  error: null,
  chartView: 'weekly',
  tableGroupBy: 'task',
  hiddenKpis: [], // All amounts visible by default; resets on reload (not persisted)

  fetchProjectDetails: async (projectNumber: string, options?: { force?: boolean }) => {
    // Join a load already under way, so callers resolve when it completes
    const pending = inFlight.get(projectNumber);
    if (pending) return pending;

    // Don't refetch if we already have this project, unless forced
    const currentProject = get().project;
    const isLoaded = currentProject?.code === projectNumber && !!get().analytics;
    if (isLoaded && !options?.force) {
      return;
    }

    const promise = (async () => {
      // A forced refresh keeps the page showing; only the time and cost figures reload
      set(isLoaded ? { isLoadingAnalytics: true, error: null } : { isLoading: true, error: null });

      try {
        // Fetch basic project details, tasks, and company currency in parallel
        const [projectData, companyInfo] = await Promise.all([
          projectDetailsService.getProjectDetails(projectNumber),
          bcClient.getCompanyInfo().catch(() => null),
        ]);
        const { project, tasks } = projectData;
        const currencyCode = companyInfo?.currencyCode || 'GBP';
        set({ project, tasks, currencyCode, isLoading: false });

        // Fetch analytics (this can take longer)
        set({ isLoadingAnalytics: true });
        try {
          const analytics = await projectDetailsService.getProjectAnalytics(
            projectNumber,
            project.isInternal
          );
          set({ analytics, isLoadingAnalytics: false });
        } catch (analyticsError) {
          // Surface the failure rather than showing zero hours/costs that look real
          console.error('Failed to load analytics:', analyticsError);
          const reason = analyticsError instanceof Error ? `: ${analyticsError.message}` : '';
          set({
            error: `Failed to load project time and cost data${reason}`,
            isLoadingAnalytics: false,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch project';
        set({ error: message, isLoading: false, isLoadingAnalytics: false });
      }
    })().finally(() => {
      if (inFlight.get(projectNumber) === promise) inFlight.delete(projectNumber);
    });
    inFlight.set(projectNumber, promise);
    return promise;
  },

  renameProject: async (name: string) => {
    const project = get().project;
    if (!project) return;

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Project name cannot be empty');
    if (trimmed.length > PROJECT_NAME_MAX_LENGTH) {
      throw new Error(`Project name cannot be longer than ${PROJECT_NAME_MAX_LENGTH} characters`);
    }
    if (trimmed === project.name) return;

    let saved: string;
    try {
      const updated = await bcClient.updateProjectName(project.id, trimmed);
      saved = updated.displayName || trimmed;
    } catch (error) {
      console.error('Failed to rename project:', error);
      const message = error instanceof Error ? error.message : '';
      if (isPermissionError(message)) {
        throw new ProjectRenamePermissionError();
      }
      throw new Error('Failed to rename the project in Business Central');
    }

    // Only apply if the user is still on the project that was renamed
    const current = get().project;
    if (current?.id === project.id) {
      set({ project: { ...current, name: saved } });
    }

    // Keep the projects list in step so it doesn't show the old name
    useProjectsStore.setState((state) => ({
      projects: state.projects.map((p) => (p.id === project.id ? { ...p, name: saved } : p)),
      selectedProject:
        state.selectedProject?.id === project.id
          ? { ...state.selectedProject, name: saved }
          : state.selectedProject,
    }));

    // The plan caches project names in its allocations, so reload it next time it's shown
    usePlanStore.getState().clearCache();
  },

  setChartView: (view) => set({ chartView: view }),

  setTableGroupBy: (groupBy) => set({ tableGroupBy: groupBy }),

  toggleKpiHidden: (label) =>
    set((state) => ({
      hiddenKpis: state.hiddenKpis.includes(label)
        ? state.hiddenKpis.filter((l) => l !== label)
        : [...state.hiddenKpis, label],
    })),

  clearProject: () =>
    set({
      project: null,
      tasks: [],
      analytics: null,
      currencyCode: 'GBP',
      error: null,
      hiddenKpis: [],
    }),
}));
