import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectService, ExtensionNotInstalledError } from '@/services/bc';
import { projectDetailsService, type BillingMode } from '@/services/bc/projectDetailsService';
import { activeCompanyKey } from './companyScope';

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
    // Results are only committed if the company hasn't switched while loading
    const companyKey = activeCompanyKey();
    const isStale = () => activeCompanyKey() !== companyKey;
    set({ isLoading: true, error: null, extensionNotInstalled: false });
    try {
      const projects = await projectService.getProjects();

      // Fetch tasks for each project (gracefully handle failures)
      const projectsWithTasks = await Promise.all(
        projects.map(async (project) => {
          try {
            const tasks = await projectService.getProjectTasks(project.code, project.isInternal);
            return { ...project, tasks };
          } catch {
            // If task fetch fails, just use empty tasks array
            return { ...project, tasks: [] };
          }
        })
      );

      if (isStale()) return;
      set({ projects: projectsWithTasks, isLoading: false, extensionNotInstalled: false });

      // Fetch hours in the background (don't block)
      get().fetchProjectHours();
    } catch (error) {
      if (isStale()) return;
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
    const companyKey = activeCompanyKey();
    set({ isLoadingHours: true });
    const { projects } = get();
    const projectCodes = projects.map((p) => p.code);
    try {
      // Time spent, estimate and billing mode for every project, as the project page works them out
      const figures = await projectService.getProjectFigures(projects);

      // Another company's figures: drop them (the new company loads its own)
      if (activeCompanyKey() !== companyKey) return;

      set((state) => {
        const billingModes = new Map(state.billingModes);
        for (const [code, { billingMode }] of figures) billingModes.set(code, billingMode);
        return {
          projects: state.projects.map((project) => {
            const projectFigures = figures.get(project.code);
            if (!projectFigures) return project;
            const { timeByStage, estimateHours, plannedHours } = projectFigures;
            return {
              ...project,
              totalHours: timeByStage.total,
              timeByStage,
              // No estimate (or plan) on the project: shown as "-"
              estimateHours: estimateHours > 0 ? estimateHours : undefined,
              plannedHours: plannedHours > 0 ? plannedHours : undefined,
            };
          }),
          billingModes,
          isLoadingHours: false,
        };
      });
    } catch {
      if (activeCompanyKey() !== companyKey) return;
      set({ isLoadingHours: false });
    }

    // Billing modes came with the figures; this only loads any still missing (e.g. if the
    // figures failed), one project at a time
    get().fetchBillingModes(projectCodes);
  },

  fetchBillingModes: async (projectCodes?: string[]) => {
    // billingModes is keyed by project code, which only means something within a company
    const companyKey = activeCompanyKey();
    const isStale = () => activeCompanyKey() !== companyKey;
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

        if (isStale()) return;
        for (const { code, mode } of results) {
          newModes.set(code, mode);
        }

        // Update state after each batch for progressive loading
        set({ billingModes: new Map(newModes) });
      }

      set({ isLoadingBillingModes: false });
    } catch {
      if (!isStale()) set({ isLoadingBillingModes: false });
    }
  },

  clearProjects: () => {
    // Billing modes are cached by project code, so they go with the company's projects
    set({
      projects: [],
      selectedProject: null,
      selectedTask: null,
      billingModes: new Map(),
      isLoading: false,
      isLoadingHours: false,
      isLoadingBillingModes: false,
    });
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
