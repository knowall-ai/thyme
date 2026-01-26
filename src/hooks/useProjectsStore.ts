import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectService, ExtensionNotInstalledError } from '@/services/bc';
import { projectDetailsService, type BillingMode } from '@/services/bc/projectDetailsService';

interface ProjectsStore {
  projects: Project[];
  selectedProject: Project | null;
  selectedTask: Task | null;
  isLoading: boolean;
  isLoadingHours: boolean;
  isLoadingBillingModes: boolean;
  billingModes: Map<string, BillingMode>;
  error: string | null;
  extensionNotInstalled: boolean;
  searchQuery: string;

  fetchProjects: () => Promise<void>;
  fetchProjectHours: () => Promise<void>;
  fetchBillingModes: (projectCodes?: string[]) => Promise<void>;
  clearProjects: () => void;
  selectProject: (project: Project | null) => void;
  selectTask: (task: Task | null) => void;
  toggleFavorite: (projectId: string) => void;
  setSearchQuery: (query: string) => void;
  getFilteredProjects: () => Project[];
  getFavoriteProjects: () => Project[];
  getRecentProjects: () => Project[];
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: [],
  selectedProject: null,
  selectedTask: null,
  isLoading: false,
  isLoadingHours: false,
  isLoadingBillingModes: false,
  billingModes: new Map(),
  error: null,
  extensionNotInstalled: false,
  searchQuery: '',

  fetchProjects: async () => {
    set({ isLoading: true, error: null, extensionNotInstalled: false });
    try {
      const projects = await projectService.getProjects();

      // Fetch tasks for each project (gracefully handle failures)
      const projectsWithTasks = await Promise.all(
        projects.map(async (project) => {
          try {
            const tasks = await projectService.getProjectTasks(project.code);
            return { ...project, tasks };
          } catch {
            // If task fetch fails, just use empty tasks array
            return { ...project, tasks: [] };
          }
        })
      );

      set({ projects: projectsWithTasks, isLoading: false, extensionNotInstalled: false });

      // Fetch hours in the background (don't block)
      get().fetchProjectHours();
    } catch (error) {
      // Check if this is an extension not installed error (custom API returns 404)
      const isExtensionError =
        error instanceof ExtensionNotInstalledError ||
        (error instanceof Error && error.message.includes('404'));
      const message = error instanceof Error ? error.message : 'Failed to fetch projects';
      set({
        error: isExtensionError ? null : message,
        isLoading: false,
        extensionNotInstalled: isExtensionError,
      });
    }
  },

  fetchProjectHours: async () => {
    set({ isLoadingHours: true });
    try {
      const { projects } = get();
      const projectCodes = projects.map((p) => p.code);

      // Fetch hours and budgets in parallel
      const [hoursMap, budgetsMap] = await Promise.all([
        projectService.getProjectHours(),
        projectService.getProjectBudgets(projectCodes),
      ]);

      // Update projects with hours and budget data
      set((state) => ({
        projects: state.projects.map((project) => ({
          ...project,
          totalHours: hoursMap.get(project.code) ?? 0,
          budgetHours: budgetsMap.get(project.code),
        })),
        isLoadingHours: false,
      }));

      // Also fetch billing modes in the background
      get().fetchBillingModes(projectCodes);
    } catch {
      set({ isLoadingHours: false });
    }
  },

  fetchBillingModes: async (projectCodes?: string[]) => {
    set({ isLoadingBillingModes: true });
    try {
      const codes = projectCodes ?? get().projects.map((p) => p.code);
      const currentModes = get().billingModes;

      // Fetch billing modes for projects not already cached
      const codesToFetch = codes.filter((code) => !currentModes.has(code));

      if (codesToFetch.length === 0) {
        set({ isLoadingBillingModes: false });
        return;
      }

      // Fetch in parallel (limit concurrency to avoid overwhelming the API)
      const batchSize = 5;
      const newModes = new Map(currentModes);

      for (let i = 0; i < codesToFetch.length; i += batchSize) {
        const batch = codesToFetch.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (code) => {
            const mode = await projectDetailsService.getBillingMode(code);
            return { code, mode };
          })
        );

        for (const { code, mode } of results) {
          newModes.set(code, mode);
        }

        // Update state after each batch for progressive loading
        set({ billingModes: new Map(newModes) });
      }

      set({ isLoadingBillingModes: false });
    } catch {
      set({ isLoadingBillingModes: false });
    }
  },

  clearProjects: () => {
    set({ projects: [], selectedProject: null, selectedTask: null });
  },

  selectProject: (project: Project | null) => {
    set({ selectedProject: project, selectedTask: null });
  },

  selectTask: (task: Task | null) => {
    set({ selectedTask: task });
  },

  toggleFavorite: (projectId: string) => {
    const isFavorite = projectService.toggleFavorite(projectId);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, isFavorite } : p)),
    }));
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  getFilteredProjects: () => {
    const { projects, searchQuery } = get();
    if (!searchQuery) return projects;

    const lowerQuery = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.code.toLowerCase().includes(lowerQuery) ||
        p.customerName?.toLowerCase().includes(lowerQuery)
    );
  },

  getFavoriteProjects: () => {
    const { projects } = get();
    return projects.filter((p) => p.isFavorite);
  },

  getRecentProjects: () => {
    const { projects } = get();
    const favorites = projects.filter((p) => p.isFavorite);
    const nonFavorites = projects.filter((p) => !p.isFavorite);
    return [...favorites, ...nonFavorites].slice(0, 5);
  },
}));
