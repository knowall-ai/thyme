import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectService } from '@/services/bc';

interface ProjectsStore {
  projects: Project[];
  selectedProject: Project | null;
  selectedTask: Task | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;

  fetchProjects: () => Promise<void>;
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
  error: null,
  searchQuery: '',

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await projectService.getProjects();

      // Fetch tasks for each project
      const projectsWithTasks = await Promise.all(
        projects.map(async (project) => {
          const tasks = await projectService.getProjectTasks(project.code);
          return { ...project, tasks };
        })
      );

      set({ projects: projectsWithTasks, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects';
      set({ error: message, isLoading: false });
    }
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
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, isFavorite } : p
      ),
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
        p.clientName?.toLowerCase().includes(lowerQuery)
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
