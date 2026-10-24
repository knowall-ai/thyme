import { create } from 'zustand';
import type {
  BCJobTask,
  BCResource,
  BCTimeSheet,
  BCJobPlanningLine,
  TimesheetDisplayStatus,
} from '@/types';
import { bcClient, ExtensionNotInstalledError } from '@/services/bc';
import { activeCompanyKey } from './companyScope';
import { getProjectCustomerName } from '@/utils/projectCustomer';
import {
  getTimesheetDisplayStatus,
  buildUOMConversionMap,
  convertToHours,
  roundToQuarterHour,
  getPlanPreloadWindow,
  type UOMConversionMap,
} from '@/utils';
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
  /**
   * The line's hours before quarter-hour rounding (hoursPerDay is rounded for the grid).
   * Poppie's plan hash is built from these, so Timmie can tell whether her review is current.
   */
  rawHours: number;
  color: string;
  lineType:
    | 'Budget'
    | 'Billable'
    | 'Both Budget and Billable'
    | 'Both_x0020_Budget_x0020_and_x0020_Billable';
  planningLineNo?: number;
  planningLineId?: string; // BC SystemId (GUID) for PATCH/DELETE operations
}

/** Planned hours beyond the weeks in view: every week, and from today on */
export interface PlannedHours {
  all: number;
  fromToday: number;
}

/** Hours planned on each date (YYYY-MM-DD), in every week */
export type PlannedDays = Map<string, number>;

/** Totals from planned days, from today (YYYY-MM-DD) as it is when they're shown */
export function sumPlannedHours(days: PlannedDays, today: string): PlannedHours {
  let all = 0;
  let fromToday = 0;
  for (const [date, hours] of days) {
    all += hours;
    if (date >= today) fromToday += hours;
  }
  return { all, fromToday };
}

export interface PlanTeamMember {
  id: string;
  number: string;
  name: string;
  timesheets: Map<string, BCTimeSheet>; // weekStart -> timesheet
  timesheetStatus: TimesheetDisplayStatus | 'No Timesheet';
  /** Hours planned in the weeks in view */
  totalHours: number;
  /** Hours by date across every project on the Plan; undefined until loaded */
  plannedDays?: PlannedDays;
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
  /** Hours planned in the weeks in view */
  totalHours: number;
  /** Hours by date; undefined until loaded, or if its planning lines couldn't be */
  plannedDays?: PlannedDays;
}

export type ViewMode = 'team' | 'projects';

export interface FetchTeamDataOptions {
  /**
   * Loading for this one project's Plan dialog: also load the weeks around it up front
   * (see getPlanPreloadWindow), so moving between weeks needs no fetch, and skip the
   * team's timesheets, which only the Team view shows.
   */
  projectCode?: string;
}

interface CachedProject {
  id: string;
  number: string;
  displayName: string;
  /** The customer the work is for (see getProjectCustomer) */
  customerName: string;
  startingDate?: string;
  endingDate?: string;
  /** Whether the signed-in user may change plans (see canEditPlan in utils/dayNotes) */
  canEditPlan?: boolean;
}

// Cached data structure
interface CachedData {
  resources: BCResource[];
  projects: CachedProject[];
  jobTasks: Map<string, BCJobTask[]>; // projectNumber -> tasks, in BC order
  loadedWeeks: Map<string, AllocationBlock[]>; // weekStart (YYYY-MM-DD) -> allocations
  resourceTimesheets: Map<string, Map<string, BCTimeSheet>>; // resourceNumber -> (weekStart -> timesheet)
  uomConversionMap: UOMConversionMap; // Cached UOM conversion map for modals
  /**
   * projectNumber -> (resourceNumber -> (date -> hours)), over all of the project's lines,
   * not just the weeks loaded: for the In view total's note. Kept by date, so "from today"
   * is worked out on each rebuild, not frozen at the day it loaded.
   */
  plannedDays: Map<string, Map<string, Map<string, number>>>;
  /** Projects whose lines couldn't be loaded, with no earlier count to fall back on */
  plannedUnavailable: Set<string>;
  lastUpdated: number;
}

interface PlanStore {
  // State
  teamMembers: PlanTeamMember[];
  projects: PlanProject[];
  allAllocations: AllocationBlock[];
  /** Each project's job tasks, in BC order */
  jobTasksByProject: Map<string, BCJobTask[]>;
  viewMode: ViewMode;
  isLoading: boolean;
  isLoadingWeeks: Set<string>; // Weeks currently being loaded
  isCreatingTimesheets: boolean;
  error: string | null;
  currentWeekStart: Date;
  weeksToShow: number; // Number of weeks to display

  // Cache for lazy loading
  cache: CachedData | null;
  uomConversionMap: UOMConversionMap; // Exposed for plan modals to avoid redundant API calls

  // Selection
  selectedMemberIds: string[];
  selectedAllocationId: string | null;

  // Drag state
  isDragging: boolean;
  draggedAllocation: AllocationBlock | null;

  // Actions
  fetchTeamData: (
    weekStart: Date,
    weeksToShow: number,
    emailDomain?: string,
    options?: FetchTeamDataOptions
  ) => Promise<void>;
  clearCache: () => void;
  /** Drop the displayed plan and its cache, and ignore loads started before the switch */
  resetForCompanySwitch: () => void;
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

  // Hours planned by date in every week, per project and per person (across projects).
  // Kept by date, so the note works out "from today" when it opens, even a day later.
  const plannedByProject = new Map<string, PlannedDays>();
  const plannedByResource = new Map<string, PlannedDays>();
  const addDay = (totals: Map<string, PlannedDays>, key: string, date: string, hours: number) => {
    const days = totals.get(key) ?? new Map<string, number>();
    days.set(date, (days.get(date) ?? 0) + hours);
    totals.set(key, days);
  };
  for (const [projectNumber, byResource] of cache.plannedDays) {
    plannedByProject.set(projectNumber, new Map());
    for (const [resourceNumber, byDate] of byResource) {
      for (const [date, hours] of byDate) {
        addDay(plannedByProject, projectNumber, date, hours);
        addDay(plannedByResource, resourceNumber, date, hours);
      }
    }
  }
  // A person's total is only shown complete: not while any project's lines are missing.
  // Someone with no lines on any project then has none planned, rather than unknown.
  const peoplePlannedKnown = cache.plannedDays.size > 0 && cache.plannedUnavailable.size === 0;

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

    // Time sheet owner's UPN; the member's own photo is resolved from it and the name
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
      plannedDays: peoplePlannedKnown
        ? (plannedByResource.get(resource.number) ?? new Map())
        : undefined,
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
      customerName: p.customerName,
      color: getProjectColor(i),
      allocations: [],
      totalHours: 0,
      plannedDays: plannedByProject.get(p.number),
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
    jobTasksByProject: cache.jobTasks,
    isLoading: false,
    selectedMemberIds: [],
    weeksToShow,
  });
}

// Most weeks one fetchTeamData call may load (the grid shows up to 6)
const MAX_WEEKS_TO_SHOW = 52;

// Latest fetchTeamData call. The store is shared by the Plan tab and a project's Planned
// dialog, so a slower, older load must not overwrite the weeks a newer one is showing.
let latestFetchId = 0;

export const usePlanStore = create<PlanStore>((set, get) => ({
  // Initial state
  teamMembers: [],
  projects: [],
  allAllocations: [],
  jobTasksByProject: new Map(),
  viewMode: 'team',
  isLoading: false,
  isLoadingWeeks: new Set<string>(),
  isCreatingTimesheets: false,
  error: null,
  currentWeekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
  weeksToShow: 1,
  cache: null,
  uomConversionMap: new Map(),
  selectedMemberIds: [],
  selectedAllocationId: null,
  isDragging: false,
  draggedAllocation: null,

  // Fetch team members, timesheets, and planning allocations for multiple weeks
  // Uses caching to avoid re-fetching already loaded weeks
  fetchTeamData: async (
    weekStart: Date,
    weeksToShow: number,
    emailDomain?: string,
    options: FetchTeamDataOptions = {}
  ) => {
    // Reject bad input before it can supersede a valid load still in flight
    if (
      !(weekStart instanceof Date) ||
      Number.isNaN(weekStart.getTime()) ||
      !Number.isInteger(weeksToShow) ||
      weeksToShow < 1 ||
      weeksToShow > MAX_WEEKS_TO_SHOW
    ) {
      return;
    }
    const fetchId = ++latestFetchId;
    const isLatest = () => fetchId === latestFetchId;
    const { cache } = get();

    // Determine which weeks need to be loaded
    const weeksToLoad: string[] = [];
    const addWeeksToLoad = (from: Date, count: number) => {
      for (let i = 0; i < count; i++) {
        const ws = startOfWeek(addWeeks(from, i), { weekStartsOn: 1 });
        const wsStr = format(ws, 'yyyy-MM-dd');
        if (!cache?.loadedWeeks.has(wsStr) && !weeksToLoad.includes(wsStr)) {
          weeksToLoad.push(wsStr);
        }
      }
    };
    addWeeksToLoad(weekStart, weeksToShow);

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
      let projectsData: CachedProject[];

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
          customerName: getProjectCustomerName(p),
          startingDate: p.startingDate,
          endingDate: p.endingDate,
          canEditPlan: p.canEditPlan,
        }));
      }

      // A project's dialog loads the weeks around the project in this one go
      if (options.projectCode) {
        const project = projectsData.find((p) => p.number === options.projectCode);
        const preload = getPlanPreloadWindow(
          weekStart,
          weeksToShow,
          project?.startingDate,
          project?.endingDate
        );
        addWeeksToLoad(preload.start, preload.weeks);
      }
      weeksToLoad.sort();

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

      // Job tasks for all projects, for task names (and a project dialog's task list).
      // Kept with the cache, so loading more weeks doesn't fetch them again.
      let jobTasks = cache?.jobTasks;
      if (!jobTasks) {
        const fetchedTasks = new Map<string, BCJobTask[]>();
        await Promise.all(
          projectsData.map(async (project) => {
            try {
              fetchedTasks.set(project.number, await bcClient.getJobTasks(project.number));
            } catch {
              // Ignore errors fetching tasks
            }
          })
        );
        jobTasks = fetchedTasks;
      } else if (options.projectCode && !jobTasks.get(options.projectCode)?.length) {
        // The dialog's project has no cached tasks: retry, as getJobTasks returns [] on failure
        try {
          const tasks = await bcClient.getJobTasks(options.projectCode);
          jobTasks = new Map(jobTasks).set(options.projectCode, tasks);
        } catch {
          // Leave it; the next load retries
        }
      }
      // Map key is "jobNo|jobTaskNo" -> task description
      const taskNameMap = new Map<string, string>();
      for (const [projectNumber, tasks] of jobTasks) {
        for (const task of tasks) {
          taskNameMap.set(`${task.jobNo || projectNumber}|${task.jobTaskNo}`, task.description);
        }
      }

      // Fetch allocations only for weeks not in cache
      const newAllocations: AllocationBlock[] = [];
      // Recounted from each load's lines; a project whose lines fail keeps its last count,
      // or, with none (say after a plan change cleared the cache), is marked unavailable
      const plannedDays = new Map(cache?.plannedDays);
      const plannedUnavailable = new Set(cache?.plannedUnavailable);

      // Use cached UOM map or fetch fresh (hoisted so cache save can access it)
      let uomConversionMap: UOMConversionMap = cache?.uomConversionMap ?? new Map();
      if (uomConversionMap.size === 0) {
        const resourceUnitsOfMeasure = await bcClient.getResourceUnitsOfMeasure();
        uomConversionMap = buildUOMConversionMap(resourceUnitsOfMeasure);
      }

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
              const planningLines = await bcClient.getJobPlanningLines(project.number, {
                throwOnError: true,
              });
              const allResourceLines = planningLines.filter(
                (line: BCJobPlanningLine) => line.type === 'Resource' && line.quantity > 0
              );

              // Every line counts towards the In view total's note, in any week
              const projectDays = new Map<string, Map<string, number>>();
              for (const line of allResourceLines) {
                const hours = roundToQuarterHour(
                  convertToHours(line.number, line.quantity, uomConversionMap)
                );
                const date = line.planningDate.slice(0, 10);
                const byDate = projectDays.get(line.number) ?? new Map<string, number>();
                byDate.set(date, (byDate.get(date) ?? 0) + hours);
                projectDays.set(line.number, byDate);
              }
              plannedDays.set(project.number, projectDays);
              plannedUnavailable.delete(project.number);

              // Only lines within the weeks being loaded go on the grid
              const resourceLines = allResourceLines.filter((line) =>
                isWithinInterval(parseISO(line.planningDate), { start: loadStart, end: loadEnd })
              );

              for (const line of resourceLines) {
                // Planned hours are kept to quarter hours, whatever unit BC stores them in
                const rawHours = convertToHours(line.number, line.quantity, uomConversionMap);
                const hours = roundToQuarterHour(rawHours);
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
                  hoursPerDay: hours,
                  totalHours: hours,
                  rawHours,
                  color: projectColorMap.get(line.jobNo) || '#6b7280',
                  lineType: line.lineType,
                  planningLineNo: line.lineNo,
                  planningLineId: line.id, // BC SystemId (GUID) for PATCH/DELETE
                };
                newAllocations.push(allocation);
              }
            } catch {
              // Skip the project on the grid; its planned hours keep their last count, if any
              if (!plannedDays.has(project.number)) plannedUnavailable.add(project.number);
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

      // Fetch timesheets for first week if not cached (a project's dialog doesn't show them)
      const firstWeekStr = format(weekStart, 'yyyy-MM-dd');
      if (!options.projectCode && !resourceTimesheets.has(firstWeekStr + '-loaded')) {
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
        jobTasks,
        loadedWeeks,
        resourceTimesheets,
        uomConversionMap,
        plannedDays,
        plannedUnavailable,
        lastUpdated: Date.now(),
      };

      // Superseded: keep the newer load's view (and its cache, which may have been cleared)
      if (!isLatest()) return;

      set({ cache: updatedCache, uomConversionMap, isLoadingWeeks: new Set() });

      // Rebuild display data from cache
      rebuildFromCache(get, set, weekStart, weeksToShow, emailDomain);
    } catch (error) {
      if (!isLatest()) return;
      const message = error instanceof Error ? error.message : 'Failed to fetch team data';
      set({
        error: message,
        isLoading: false,
        isLoadingWeeks: new Set(),
        teamMembers: [],
        projects: [],
        allAllocations: [],
        jobTasksByProject: new Map(),
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

  resetForCompanySwitch: () => {
    // Supersede any load still in flight, so it can't write the old company's plan back
    latestFetchId++;
    set({
      cache: null,
      teamMembers: [],
      projects: [],
      allAllocations: [],
      jobTasksByProject: new Map(),
      uomConversionMap: new Map(),
      isLoading: false,
      isLoadingWeeks: new Set(),
      error: null,
      selectedMemberIds: [],
      selectedAllocationId: null,
      isDragging: false,
      draggedAllocation: null,
    });
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

    const companyKey = activeCompanyKey();
    const results = await bcClient.createTimeSheetsForResources(resourceNos, weekStartStr);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // After a company switch the selection belongs to the new company; leave it alone
    if (activeCompanyKey() === companyKey) {
      set({ isCreatingTimesheets: false, selectedMemberIds: [] });
    }

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
