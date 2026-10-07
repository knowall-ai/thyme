import { create } from 'zustand';
import type { BCEmployee, BCResource, Teammate } from '@/types';
import { bcClient } from '@/services/bc/bcClient';
import { isTeamMember } from '@/utils/teamMember';

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
const resourceNameKey = (resource: BCResource) =>
  (resource.name || resource.displayName || '').trim().toLowerCase();

function findMatchingEmployee(
  resource: BCResource,
  employees: BCEmployee[],
  duplicateResourceNames: Set<string>
): BCEmployee | undefined {
  const resourceName = resourceNameKey(resource);
  // Only enrich on an unambiguous name: two people with the same name would otherwise
  // swap job titles and emails (and email feeds the current-user check)
  if (!resourceName || duplicateResourceNames.has(resourceName)) return undefined;
  const matches = employees.filter((e) => e.displayName?.trim().toLowerCase() === resourceName);
  return matches.length === 1 ? matches[0] : undefined;
}

// Latest teammates fetch, so an older one resolving last can't replace its list
let teammatesFetchSeq = 0;

export const useTeammateStore = create<TeammateStore>((set, get) => ({
  teammates: [],
  selectedTeammate: null,
  isLoading: false,
  error: null,

  fetchTeammates: async (currentUserEmail?: string) => {
    const seq = ++teammatesFetchSeq;
    set({ isLoading: true, error: null });
    try {
      // Sourced from resources, not employees: timesheets are keyed on the resource,
      // and a company can have resources set up for time tracking with no employee
      // records at all. Only resources flagged for time sheets can have one, so
      // anything else would just be a dead entry in the list; blocked resources
      // (typically leavers) are left out too. The query narrows what BC sends; the
      // shared isTeamMember rule (which also needs a Time Sheet Owner) decides.
      const [allResources, employees] = await Promise.all([
        bcClient.getResources(
          'useTimeSheet eq true and blocked eq false and privacyBlocked eq false'
        ),
        bcClient.getEmployees("status eq 'Active'").catch(() => [] as BCEmployee[]),
      ]);
      const resources = allResources.filter(isTeamMember);

      let currentUserResourceNo: string | undefined;
      if (currentUserEmail) {
        try {
          const resource = await bcClient.getResourceByEmail(currentUserEmail);
          currentUserResourceNo = resource?.number;
        } catch {
          // Falling back to no current-user marker is fine; the list still works
        }
      }

      const seenNames = new Set<string>();
      const duplicateResourceNames = new Set<string>();
      for (const resource of resources) {
        const key = resourceNameKey(resource);
        if (key && seenNames.has(key)) duplicateResourceNames.add(key);
        seenNames.add(key);
      }

      const teammates: Teammate[] = resources.map((resource) => {
        const employee = findMatchingEmployee(resource, employees, duplicateResourceNames);
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
      // A newer fetch (e.g. after another company switch) has started: this list is stale
      if (seq !== teammatesFetchSeq) return;
      set((state) => ({
        teammates,
        isLoading: false,
        // Drop a selection that isn't in the refreshed list (e.g. after a company switch),
        // so one company's resource is never used against another — which, with the
        // Create timesheet button, could create a timesheet for the wrong person
        selectedTeammate:
          state.selectedTeammate && teammates.some((t) => t.id === state.selectedTeammate?.id)
            ? state.selectedTeammate
            : null,
      }));
    } catch (error) {
      if (seq !== teammatesFetchSeq) return;
      const message = error instanceof Error ? error.message : 'Failed to fetch teammates';
      set({ error: message, isLoading: false, teammates: [], selectedTeammate: null });
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
