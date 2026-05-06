import { create } from 'zustand';
import type { BCResource } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface TeammateStore {
  teammates: BCResource[];
  selectedTeammate: BCResource | null;
  isLoading: boolean;
  error: string | null;

  fetchTeammates: () => Promise<void>;
  selectTeammate: (teammate: BCResource | null) => void;
  clearSelection: () => void;
  isViewingTeammate: () => boolean;
}

export const useTeammateStore = create<TeammateStore>((set, get) => ({
  teammates: [],
  selectedTeammate: null,
  isLoading: false,
  error: null,

  fetchTeammates: async () => {
    set({ isLoading: true, error: null });
    try {
      // Resources are the entities that own timesheets, so look them up directly
      // (employees -> resources mapping is unreliable in BC).
      const resources = await bcClient.getResources();
      // Only show resources that actually use timesheets — others have nothing to display.
      const withTimesheet = resources.filter((r) => r.useTimeSheet);
      set({ teammates: withTimesheet, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch teammates';
      set({ error: message, isLoading: false, teammates: [] });
    }
  },

  selectTeammate: (teammate: BCResource | null) => {
    set({ selectedTeammate: teammate });
  },

  clearSelection: () => {
    set({ selectedTeammate: null });
  },

  isViewingTeammate: () => {
    return get().selectedTeammate !== null;
  },
}));
