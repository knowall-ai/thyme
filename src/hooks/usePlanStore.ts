import { create } from 'zustand';
import type { BCResource, BCTimeSheet, BCJobPlanningLine, TimesheetDisplayStatus } from '@/types';
import { bcClient, ExtensionNotInstalledError } from '@/services/bc';
import { getTimesheetDisplayStatus } from '@/utils';
import { addWeeks, startOfWeek, endOfWeek, format, parseISO, isWithinInterval } from 'date-fns';

// Allocation block representing planned work on a project
export interface AllocationBlock {
  id: string;
  resourceId: string;
  resourceNumber: string;
  resourceName: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  taskId?: string;
  taskNumber?: string;
  taskName?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hoursPerDay: number;
  totalHours: number;
  color: string;
  lineType: 'Budget' | 'Billable' | 'Both Budget and Billable';
  planningLineNo?: number;
  planningLineId?: string; // BC SystemId (GUID) for PATCH/DELETE operations
}

export interface PlanTeamMember {
  id: string;
  number: string;
  name: string;
  timesheets: Map<string, BCTimeSheet>; // weekStart -> timesheet
  timesheetStatus: TimesheetDisplayStatus | 'No Timesheet';
  totalHours: number;
  isSelected: boolean;
  photoUrl: string | null;
  userPrincipalName: string | null;
  allocations: AllocationBlock[];
}

export interface PlanProject {
  id: string;
  number: string;
  name: string;
  customerName: string;
  color: string;
  allocations: AllocationBlock[];
  totalHours: number;
}

export type ViewMode = 'team' | 'projects';

// Cached data structure
interface CachedData {
  resources: BCResource[];
  projects: { id: string; number: string; displayName: string; billToCustomerName: string }[];
  loadedWeeks: Map<string, AllocationBlock[]>; // weekStart (YYYY-MM-DD) -> allocations
  resourceTimesheets: Map<string, Map<string, BCTimeSheet>>; // resourceNumber -> (weekStart -> timesheet)
  lastUpdated: number;
}

interface PlanStore {
  // State
  teamMembers: PlanTeamMember[];
  projects: PlanProject[];
  allAllocations: AllocationBlock[];
  viewMode: ViewMode;
  isLoading: boolean;
  isLoadingWeeks: Set<string>; // Weeks currently being loaded
  isCreatingTimesheets: boolean;
  error: string | null;
  currentWeekStart: Date;
  weeksToShow: number; // Number of weeks to display

  // Cache for lazy loading
  cache: CachedData | null;

  // Selection
  selectedMemberIds: string[];
  selectedAllocationId: string | null;

  // Drag state
  isDragging: boolean;
  draggedAllocation: AllocationBlock | null;

  // Actions
  fetchTeamData: (weekStart: Date, weeksToShow: number, emailDomain?: string) => Promise<void>;
  clearCache: () => void;
  setCurrentWeekStart: (date: Date) => void;
  setWeeksToShow: (weeks: number) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleMemberSelection: (memberId: string) => void;
  selectAllWithoutTimesheet: () => void;
  clearSelection: () => void;
  createTimesheetsForSelected: () => Promise<{
    success: number;
    failed: number;
    errors: string[];
  }>;
  updateMemberPhoto: (memberId: string, photoUrl: string) => void;

  // Allocation actions
  selectAllocation: (allocationId: string | null) => void;
  createAllocation: (
    resourceNumber: string,
    projectNumber: string,
    startDate: string,
    endDate: string,
    hoursPerDay: number
  ) => Promise<boolean>;
  updateAllocation: (
    allocationId: string,
    updates: Partial<Pick<AllocationBlock, 'startDate' | 'endDate' | 'hoursPerDay'>>
  ) => Promise<boolean>;
  deleteAllocation: (allocationId: string) => Promise<boolean>;
  splitAllocation: (allocationId: string, splitDate: string) => Promise<boolean>;

  // Drag and drop
  startDrag: (allocation: AllocationBlock) => void;
  endDrag: () => void;
  dropAllocation: (newStartDate: string) => Promise<boolean>;
}

// Project colors palette
const PROJECT_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

function getProjectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

// Helper function to rebuild display data from cache
function rebuildFromCache(
  get: () => PlanStore,
  set: (state: Partial<PlanStore>) => void,
  weekStart: Date,
  weeksToShow: number,
  emailDomain?: string
) {
  const { cache } = get();
  if (!cache) return;

  const { resources, projects: projectsData, loadedWeeks, resourceTimesheets } = cache;

  // Collect allocations for the visible range
  const allAllocations: AllocationBlock[] = [];
  const resourceAllocationsMap = new Map<string, AllocationBlock[]>();

  // Initialize empty allocations array for each resource
  resources.forEach((r: BCResource) => {
    resourceAllocationsMap.set(r.number, []);
  });

  // Gather allocations from cached weeks
  for (let i = 0; i < weeksToShow; i++) {
    const ws = startOfWeek(addWeeks(weekStart, i), { weekStartsOn: 1 });
    const wsStr = format(ws, 'yyyy-MM-dd');
    const weekAllocations = loadedWeeks.get(wsStr) || [];

    for (const allocation of weekAllocations) {
      allAllocations.push(allocation);
      const resourceAllocs = resourceAllocationsMap.get(allocation.resourceNumber);
      if (resourceAllocs) {
        resourceAllocs.push(allocation);
      }
    }
  }

  // Build team members with their allocations
  const firstWeekStr = format(weekStart, 'yyyy-MM-dd');
  const membersWithData: PlanTeamMember[] = resources.map((resource: BCResource) => {
    const timesheets = new Map<string, BCTimeSheet>();
    let latestStatus: TimesheetDisplayStatus | 'No Timesheet' = 'No Timesheet';

    // Get cached timesheet for first week
    const resourceTs = resourceTimesheets.get(resource.number);
    if (resourceTs) {
      const ts = resourceTs.get(firstWeekStr);
      if (ts) {
        timesheets.set(firstWeekStr, ts);
        latestStatus = getTimesheetDisplayStatus(ts);
      }
    }

    // Derive UPN for profile photo
    let userPrincipalName: string | null = null;
    if (resource.timeSheetOwnerUserId && emailDomain) {
      userPrincipalName = `${resource.timeSheetOwnerUserId.toLowerCase()}@${emailDomain}`;
    }

    // Get allocations for this resource
    const resourceAllocations = resourceAllocationsMap.get(resource.number) || [];
    const totalHours = resourceAllocations.reduce((sum, a) => sum + a.totalHours, 0);

    // Preserve existing photo URL if available
    const existingMember = get().teamMembers.find((m) => m.id === resource.id);

    return {
      id: resource.id,
      number: resource.number,
      name: resource.name || resource.displayName || resource.number,
      timesheets,
      timesheetStatus: latestStatus,
      totalHours,
      isSelected: false,
      photoUrl: existingMember?.photoUrl || null,
      userPrincipalName,
      allocations: resourceAllocations,
    };
  });

  // Build projects view
  const projectsMap = new Map<string, PlanProject>();
  projectsData.forEach((p, i) => {
    projectsMap.set(p.number, {
      id: p.id,
      number: p.number,
      name: p.displayName || p.number,
      customerName: p.billToCustomerName || '',
      color: getProjectColor(i),
      allocations: [],
      totalHours: 0,
    });
  });

  for (const allocation of allAllocations) {
    const project = projectsMap.get(allocation.projectNumber);
    if (project) {
      project.allocations.push(allocation);
      project.totalHours += allocation.totalHours;
    }
  }

  set({
    teamMembers: membersWithData,
    projects: Array.from(projectsMap.values()),
    allAllocations,
    isLoading: false,
    selectedMemberIds: [],
    weeksToShow,
  });
}

export const usePlanStore = create<PlanStore>((set, get) => ({
  // Initial state
  teamMembers: [],
  projects: [],
  allAllocations: [],
  viewMode: 'team',
  isLoading: false,
  isLoadingWeeks: new Set<string>(),
  isCreatingTimesheets: false,
  error: null,
  currentWeekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
  weeksToShow: 1,
  cache: null,
  selectedMemberIds: [],
  selectedAllocationId: null,
  isDragging: false,
  draggedAllocation: null,

  // Fetch team members, timesheets, and planning allocations for multiple weeks
  // Uses caching to avoid re-fetching already loaded weeks
  fetchTeamData: async (weekStart: Date, weeksToShow: number, emailDomain?: string) => {
    const { cache } = get();

    // Determine which weeks need to be loaded
    const weeksToLoad: string[] = [];
    for (let i = 0; i < weeksToShow; i++) {
      const ws = startOfWeek(addWeeks(weekStart, i), { weekStartsOn: 1 });
      const wsStr = format(ws, 'yyyy-MM-dd');
      if (!cache?.loadedWeeks.has(wsStr)) {
        weeksToLoad.push(wsStr);
      }
    }

    // If we have cache and all weeks are loaded, just rebuild from cache
    if (cache && weeksToLoad.length === 0) {
      rebuildFromCache(get, set, weekStart, weeksToShow, emailDomain);
      return;
    }

    // Show loading for specific weeks being loaded
    set({
      isLoading: !cache, // Only show full loading if no cache exists
      isLoadingWeeks: new Set(weeksToLoad),
      error: null,
    });

    try {
      // Get resources and projects (use cache if available)
      let resources: BCResource[];
      let projectsData: {
        id: string;
        number: string;
        displayName: string;
        billToCustomerName: string;
      }[];

      if (cache) {
        resources = cache.resources;
        projectsData = cache.projects;
      } else {
        const [fetchedResources, fetchedProjects] = await Promise.all([
          bcClient.getResources(),
          bcClient.getProjects(),
        ]);
        resources = fetchedResources;
        projectsData = fetchedProjects.map((p) => ({
          id: p.id,
          number: p.number,
          displayName: p.displayName || p.number,
          billToCustomerName: p.billToCustomerName || '',
        }));
      }

      // Create maps for lookups
      const projectColorMap = new Map<string, string>();
      const projectNameMap = new Map<string, string>();
      projectsData.forEach((p, i) => {
        projectColorMap.set(p.number, getProjectColor(i));
        projectNameMap.set(p.number, p.displayName || p.number);
      });

      const resourceNameMap = new Map<string, string>();
      const resourceIdMap = new Map<string, string>();
      resources.forEach((r: BCResource) => {
        resourceNameMap.set(r.number, r.name || r.displayName || r.number);
        resourceIdMap.set(r.number, r.id);
      });

      // Fetch job tasks for all projects to get actual task names
      // Map key is "jobNo|jobTaskNo" -> task description
      const taskNameMap = new Map<string, string>();
      await Promise.all(
        projectsData.map(async (project) => {
          try {
            const tasks = await bcClient.getJobTasks(project.number);
            for (const task of tasks) {
              taskNameMap.set(`${task.jobNo}|${task.jobTaskNo}`, task.description);
            }
          } catch {
            // Ignore errors fetching tasks
          }
        })
      );

      // Fetch allocations only for weeks not in cache
      const newAllocations: AllocationBlock[] = [];

      if (weeksToLoad.length > 0) {
        // Calculate date range for weeks to load
        const loadStart = parseISO(weeksToLoad[0]);
        const loadEnd = endOfWeek(parseISO(weeksToLoad[weeksToLoad.length - 1]), {
          weekStartsOn: 1,
        });

        // Fetch planning lines for each project
        await Promise.all(
          projectsData.map(async (project) => {
            try {
              const planningLines = await bcClient.getJobPlanningLines(project.number);

              // Filter for Resource type lines within date range
              const resourceLines = planningLines.filter(
                (line: BCJobPlanningLine) =>
                  line.type === 'Resource' &&
                  line.quantity > 0 &&
                  isWithinInterval(parseISO(line.planningDate), { start: loadStart, end: loadEnd })
              );

              for (const line of resourceLines) {
                const allocation: AllocationBlock = {
                  id: `${line.jobNo}-${line.jobTaskNo}-${line.lineNo}`,
                  resourceId: resourceIdMap.get(line.number) || line.number,
                  resourceNumber: line.number,
                  resourceName: resourceNameMap.get(line.number) || line.number,
                  projectId: line.jobNo,
                  projectNumber: line.jobNo,
                  projectName: projectNameMap.get(line.jobNo) || line.jobNo,
                  taskId: line.jobTaskNo,
                  taskNumber: line.jobTaskNo,
                  taskName: taskNameMap.get(`${line.jobNo}|${line.jobTaskNo}`) || line.jobTaskNo,
                  startDate: line.planningDate,
                  endDate: line.planningDate,
                  hoursPerDay: line.quantity,
                  totalHours: line.quantity,
                  color: projectColorMap.get(line.jobNo) || '#6b7280',
                  lineType: line.lineType,
                  planningLineNo: line.lineNo,
                  planningLineId: line.id, // BC SystemId (GUID) for PATCH/DELETE
                };
                newAllocations.push(allocation);
              }
            } catch {
              // Skip projects without planning lines or if API fails
            }
          })
        );
      }

      // Update cache with new data
      const loadedWeeks = new Map(cache?.loadedWeeks || []);
      const resourceTimesheets = new Map(cache?.resourceTimesheets || []);

      // Group new allocations by week
      for (const weekStr of weeksToLoad) {
        const weekStartDate = parseISO(weekStr);
        const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });
        const weekAllocations = newAllocations.filter((a) => {
          const allocDate = parseISO(a.startDate);
          return isWithinInterval(allocDate, { start: weekStartDate, end: weekEndDate });
        });
        loadedWeeks.set(weekStr, weekAllocations);
      }

      // Fetch timesheets for first week if not cached
      const firstWeekStr = format(weekStart, 'yyyy-MM-dd');
      if (!resourceTimesheets.has(firstWeekStr + '-loaded')) {
        await Promise.all(
          resources.map(async (resource: BCResource) => {
            try {
              const weekTimesheets = await bcClient.getTimeSheets(resource.number, firstWeekStr);
              if (weekTimesheets.length > 0) {
                const ts = weekTimesheets[0];
                if (!resourceTimesheets.has(resource.number)) {
                  resourceTimesheets.set(resource.number, new Map());
                }
                resourceTimesheets.get(resource.number)!.set(firstWeekStr, ts);
              }
            } catch {
              // Resource doesn't have a timesheet for this week
            }
          })
        );
        // Mark this week's timesheets as loaded
        resourceTimesheets.set(firstWeekStr + '-loaded', new Map());
      }

      // Save updated cache
      const updatedCache: CachedData = {
        resources,
        projects: projectsData,
        loadedWeeks,
        resourceTimesheets,
        lastUpdated: Date.now(),
      };

      set({ cache: updatedCache, isLoadingWeeks: new Set() });

      // Rebuild display data from cache
      rebuildFromCache(get, set, weekStart, weeksToShow, emailDomain);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch team data';
      set({
        error: message,
        isLoading: false,
        isLoadingWeeks: new Set(),
        teamMembers: [],
        projects: [],
        allAllocations: [],
      });
      // Re-throw ExtensionNotInstalledError so the UI can show the proper component
      if (error instanceof ExtensionNotInstalledError) {
        throw error;
      }
    }
  },

  clearCache: () => {
    set({ cache: null });
  },

  setCurrentWeekStart: (date: Date) => {
    set({ currentWeekStart: date, selectedMemberIds: [], selectedAllocationId: null });
  },

  setWeeksToShow: (weeks: number) => {
    set({ weeksToShow: weeks });
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode, selectedAllocationId: null });
  },

  toggleMemberSelection: (memberId: string) => {
    set((state) => {
      const isSelected = state.selectedMemberIds.includes(memberId);
      return {
        selectedMemberIds: isSelected
          ? state.selectedMemberIds.filter((id) => id !== memberId)
          : [...state.selectedMemberIds, memberId],
      };
    });
  },

  selectAllWithoutTimesheet: () => {
    set((state) => ({
      selectedMemberIds: state.teamMembers
        .filter((m) => m.timesheetStatus === 'No Timesheet')
        .map((m) => m.id),
    }));
  },

  clearSelection: () => {
    set({ selectedMemberIds: [] });
  },

  createTimesheetsForSelected: async () => {
    const { selectedMemberIds, teamMembers, currentWeekStart } = get();

    if (selectedMemberIds.length === 0) {
      return { success: 0, failed: 0, errors: ['No members selected'] };
    }

    set({ isCreatingTimesheets: true, error: null });

    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
    const resourceNos = selectedMemberIds
      .map((id) => teamMembers.find((m) => m.id === id)?.number)
      .filter((no): no is string => !!no);

    const results = await bcClient.createTimeSheetsForResources(resourceNos, weekStartStr);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    set({ isCreatingTimesheets: false, selectedMemberIds: [] });

    return {
      success: successes.length,
      failed: failures.length,
      errors: failures.map((f) => `${f.resourceNo}: ${f.error}`),
    };
  },

  updateMemberPhoto: (memberId: string, photoUrl: string) => {
    set((state) => ({
      teamMembers: state.teamMembers.map((member) =>
        member.id === memberId ? { ...member, photoUrl } : member
      ),
    }));
  },

  // Allocation actions
  selectAllocation: (allocationId: string | null) => {
    set({ selectedAllocationId: allocationId });
  },

  createAllocation: async (
    _resourceNumber: string,
    _projectNumber: string,
    _startDate: string,
    _endDate: string,
    _hoursPerDay: number
  ) => {
    // This would create a timesheet line - requires BC extension support
    // For now, return false as not implemented
    return false;
  },

  updateAllocation: async (
    _allocationId: string,
    _updates: Partial<Pick<AllocationBlock, 'startDate' | 'endDate' | 'hoursPerDay'>>
  ) => {
    // This would update timesheet details - requires BC extension support
    return false;
  },

  deleteAllocation: async (_allocationId: string) => {
    // This would delete a timesheet line - requires BC extension support
    return false;
  },

  splitAllocation: async (_allocationId: string, _splitDate: string) => {
    // This would split an allocation into two parts
    return false;
  },

  // Drag and drop
  startDrag: (allocation: AllocationBlock) => {
    set({ isDragging: true, draggedAllocation: allocation });
  },

  endDrag: () => {
    set({ isDragging: false, draggedAllocation: null });
  },

  dropAllocation: async (newStartDate: string) => {
    const { draggedAllocation } = get();
    if (!draggedAllocation) return false;

    // Calculate new end date based on duration
    const startMs = new Date(draggedAllocation.startDate).getTime();
    const endMs = new Date(draggedAllocation.endDate).getTime();
    const durationMs = endMs - startMs;
    const newEndDate = format(
      new Date(new Date(newStartDate).getTime() + durationMs),
      'yyyy-MM-dd'
    );

    const success = await get().updateAllocation(draggedAllocation.id, {
      startDate: newStartDate,
      endDate: newEndDate,
    });

    set({ isDragging: false, draggedAllocation: null });
    return success;
  },
}));
