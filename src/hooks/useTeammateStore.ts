import { create } from 'zustand';
import type { BCEmployee, BCResource, Teammate } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface TeammateStore {
  teammates: Teammate[];
  selectedTeammate: Teammate | null;
  isLoading: boolean;
  error: string | null;

  fetchTeammates: (currentUserEmail?: string) => Promise<void>;
  selectTeammate: (teammate: Teammate | null) => void;
  clearSelection: () => void;
  isViewingTeammate: () => boolean;
}

/**
 * Employee records carry the nicer display data (job title, email) but are optional
 * in BC - a company can run timesheets with resources alone. Match on name so the
 * extra detail is used where it exists, without the list depending on it.
 */
function findMatchingEmployee(
  resource: BCResource,
  employees: BCEmployee[]
): BCEmployee | undefined {
  const resourceName = (resource.name || resource.displayName || '').trim().toLowerCase();
  if (!resourceName) return undefined;
  return employees.find((e) => e.displayName?.trim().toLowerCase() === resourceName);
}

export const useTeammateStore = create<TeammateStore>((set, get) => ({
  teammates: [],
  selectedTeammate: null,
  isLoading: false,
  error: null,

  fetchTeammates: async (currentUserEmail?: string) => {
    set({ isLoading: true, error: null });
    try {
      // Sourced from resources, not employees: timesheets are keyed on the resource,
      // and a company can have resources set up for time tracking with no employee
      // records at all. Only resources flagged for time sheets can have one, so
      // anything else would just be a dead entry in the list.
      const [resources, employees] = await Promise.all([
        bcClient.getResources('useTimeSheet eq true'),
        bcClient.getEmployees("status eq 'Active'").catch(() => [] as BCEmployee[]),
      ]);

      let currentUserResourceNo: string | undefined;
      if (currentUserEmail) {
        try {
          const resource = await bcClient.getResourceByEmail(currentUserEmail);
          currentUserResourceNo = resource?.number;
        } catch {
          // Falling back to no current-user marker is fine; the list still works
        }
      }

      const teammates: Teammate[] = resources.map((resource) => {
        const employee = findMatchingEmployee(resource, employees);
        return {
          id: resource.id,
          resourceNo: resource.number,
          displayName: resource.name || resource.displayName || resource.number,
          givenName: employee?.givenName,
          surname: employee?.surname,
          jobTitle: employee?.jobTitle,
          email: employee?.email,
          isCurrentUser: resource.number === currentUserResourceNo,
        };
      });

      teammates.sort((a, b) => a.displayName.localeCompare(b.displayName));
      set({ teammates, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch teammates';
      set({ error: message, isLoading: false, teammates: [] });
    }
  },

  selectTeammate: (teammate: Teammate | null) => {
    set({ selectedTeammate: teammate });
  },

  clearSelection: () => {
    set({ selectedTeammate: null });
  },

  isViewingTeammate: () => {
    return get().selectedTeammate !== null;
  },
}));
