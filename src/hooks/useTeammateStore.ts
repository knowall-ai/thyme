import { create } from 'zustand';
import type { BCEmployee } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface TeammateStore {
  teammates: BCEmployee[];
  selectedTeammate: BCEmployee | null;
  isLoading: boolean;
  error: string | null;

  fetchTeammates: () => Promise<void>;
  selectTeammate: (teammate: BCEmployee | null) => void;
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
      const employees = await bcClient.getEmployees("status eq 'Active'");
      set({ teammates: employees, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch teammates';
      set({ error: message, isLoading: false, teammates: [] });
    }
  },

  selectTeammate: (teammate: BCEmployee | null) => {
    set({ selectedTeammate: teammate });
  },

  clearSelection: () => {
    set({ selectedTeammate: null });
  },

  isViewingTeammate: () => {
    return get().selectedTeammate !== null;
  },
}));
