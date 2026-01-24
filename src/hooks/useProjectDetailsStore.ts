import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectDetailsService, type ProjectAnalytics } from '@/services/bc/projectDetailsService';

interface ProjectDetailsStore {
  // State
  project: Project | null;
  tasks: Task[];
  analytics: ProjectAnalytics | null;
  isLoading: boolean;
  isLoadingAnalytics: boolean;
  error: string | null;

  // UI State
  chartView: 'weekly' | 'progress';
  tableGroupBy: 'task' | 'team';

  // Actions
  fetchProjectDetails: (projectNumber: string) => Promise<void>;
  setChartView: (view: 'weekly' | 'progress') => void;
  setTableGroupBy: (groupBy: 'task' | 'team') => void;
  clearProject: () => void;
}

export const useProjectDetailsStore = create<ProjectDetailsStore>((set, get) => ({
  // Initial state
  project: null,
  tasks: [],
  analytics: null,
  isLoading: false,
  isLoadingAnalytics: false,
  error: null,
  chartView: 'weekly',
  tableGroupBy: 'task',

  fetchProjectDetails: async (projectNumber: string) => {
    // Don't refetch if we already have this project
    const currentProject = get().project;
    if (currentProject?.code === projectNumber && get().analytics) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Fetch basic project details and tasks
      const { project, tasks } = await projectDetailsService.getProjectDetails(projectNumber);
      set({ project, tasks, isLoading: false });

      // Fetch analytics (this can take longer)
      set({ isLoadingAnalytics: true });
      try {
        const analytics = await projectDetailsService.getProjectAnalytics(projectNumber);
        set({ analytics, isLoadingAnalytics: false });
      } catch (analyticsError) {
        // Don't fail the whole page if analytics fails
        console.error('Failed to load analytics:', analyticsError);
        set({
          analytics: {
            totalHours: 0,
            billableHours: 0,
            nonBillableHours: 0,
            hoursThisWeek: 0,
            teamMemberCount: 0,
            weeklyData: [],
            taskBreakdown: [],
            teamBreakdown: [],
          },
          isLoadingAnalytics: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch project';
      set({ error: message, isLoading: false, isLoadingAnalytics: false });
    }
  },

  setChartView: (view) => set({ chartView: view }),

  setTableGroupBy: (groupBy) => set({ tableGroupBy: groupBy }),

  clearProject: () =>
    set({
      project: null,
      tasks: [],
      analytics: null,
      error: null,
    }),
}));
