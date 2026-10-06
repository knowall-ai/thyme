import { create } from 'zustand';
import type { Project, Task } from '@/types';
import { projectDetailsService, type ProjectAnalytics } from '@/services/bc/projectDetailsService';
import { bcClient } from '@/services/bc/bcClient';

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
  showCosts: boolean; // Toggle for internal costs visibility (Budget Cost, Actual Cost)
  showPrices: boolean; // Toggle for customer-facing prices visibility (revenue KPIs, PDF export)

  // Actions
  fetchProjectDetails: (projectNumber: string) => Promise<void>;
  setChartView: (view: 'weekly' | 'progress') => void;
  setTableGroupBy: (groupBy: 'task' | 'team') => void;
  setShowCosts: (show: boolean) => void;
  setShowPrices: (show: boolean) => void;
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
  showCosts: true, // Internal costs visible by default (per-widget Eye toggles hide individually); also gates the Spend vs Budget chart and PDF export
  showPrices: true, // Customer-facing prices always visible by default

  fetchProjectDetails: async (projectNumber: string) => {
    // Join a load already under way, so callers resolve when it completes
    const pending = inFlight.get(projectNumber);
    if (pending) return pending;

    // Don't refetch if we already have this project
    const currentProject = get().project;
    if (currentProject?.code === projectNumber && get().analytics) {
      return;
    }

    const promise = (async () => {
      set({ isLoading: true, error: null });

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
          const analytics = await projectDetailsService.getProjectAnalytics(projectNumber);
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

  setChartView: (view) => set({ chartView: view }),

  setTableGroupBy: (groupBy) => set({ tableGroupBy: groupBy }),

  setShowCosts: (show) => set({ showCosts: show }),

  setShowPrices: (show) => set({ showPrices: show }),

  clearProject: () =>
    set({
      project: null,
      tasks: [],
      analytics: null,
      currencyCode: 'GBP',
      error: null,
    }),
}));
