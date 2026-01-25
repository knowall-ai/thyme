import { create } from 'zustand';
import type { BCResource, BCTimeSheet, BCTimeSheetLine, TimesheetDisplayStatus } from '@/types';
import { bcClient } from '@/services/bc/bcClient';
import { getTimesheetDisplayStatus } from '@/utils';
import { addWeeks, eachDayOfInterval, startOfWeek, endOfWeek, format } from 'date-fns';

// Allocation block representing work on a project
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
  timeSheetNo?: string;
  lineNo?: number;
  status: 'Open' | 'Submitted' | 'Approved' | 'Rejected';
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
  color: string;
  allocations: AllocationBlock[];
  totalHours: number;
}

export type ViewMode = 'team' | 'projects';

interface PlanStore {
  // State
  teamMembers: PlanTeamMember[];
  projects: PlanProject[];
  allAllocations: AllocationBlock[];
  viewMode: ViewMode;
  isLoading: boolean;
  isCreatingTimesheets: boolean;
  error: string | null;
  currentWeekStart: Date;
  weeksToShow: number; // Number of weeks to display

  // Selection
  selectedMemberIds: string[];
  selectedAllocationId: string | null;

  // Drag state
  isDragging: boolean;
  draggedAllocation: AllocationBlock | null;

  // Actions
  fetchTeamData: (weekStart: Date, weeksToShow: number, emailDomain?: string) => Promise<void>;
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

export const usePlanStore = create<PlanStore>((set, get) => ({
  // Initial state
  teamMembers: [],
  projects: [],
  allAllocations: [],
  viewMode: 'team',
  isLoading: false,
  isCreatingTimesheets: false,
  error: null,
  currentWeekStart: startOfWeek(new Date(), { weekStartsOn: 1 }),
  weeksToShow: 1,
  selectedMemberIds: [],
  selectedAllocationId: null,
  isDragging: false,
  draggedAllocation: null,

  // Fetch team members, timesheets, and allocations for multiple weeks
  fetchTeamData: async (weekStart: Date, weeksToShow: number, emailDomain?: string) => {
    set({ isLoading: true, error: null });
    try {
      // Get all resources and projects
      const [resources, projectsData] = await Promise.all([
        bcClient.getResources(),
        bcClient.getProjects(),
      ]);

      // Create project color map
      const projectColorMap = new Map<string, string>();
      const projectNameMap = new Map<string, string>();
      projectsData.forEach((p, i) => {
        projectColorMap.set(p.number, getProjectColor(i));
        projectNameMap.set(p.number, p.displayName || p.number);
      });

      // Calculate date range for multiple weeks
      const endDate = endOfWeek(addWeeks(weekStart, weeksToShow - 1), { weekStartsOn: 1 });
      const allDays = eachDayOfInterval({ start: weekStart, end: endDate });

      // Fetch timesheet data for each resource across all weeks
      const allAllocations: AllocationBlock[] = [];
      const membersWithTimesheets = await Promise.all(
        resources.map(async (resource: BCResource) => {
          const timesheets = new Map<string, BCTimeSheet>();
          const resourceAllocations: AllocationBlock[] = [];
          let totalHours = 0;
          let latestStatus: TimesheetDisplayStatus | 'No Timesheet' = 'No Timesheet';

          // Fetch timesheets for each week
          for (let w = 0; w < weeksToShow; w++) {
            const weekDate = addWeeks(weekStart, w);
            const weekStartStr = format(weekDate, 'yyyy-MM-dd');

            try {
              const weekTimesheets = await bcClient.getTimeSheets(resource.number, weekStartStr);
              if (weekTimesheets.length > 0) {
                const ts = weekTimesheets[0];
                timesheets.set(weekStartStr, ts);
                totalHours += ts.totalQuantity || 0;
                latestStatus = getTimesheetDisplayStatus(ts);

                // Fetch timesheet lines to build allocation blocks
                try {
                  const lines = await bcClient.getTimeSheetLines(ts.number);
                  const jobLines = lines.filter(
                    (line: BCTimeSheetLine) => line.type === 'Job' && line.jobNo
                  );

                  for (const line of jobLines) {
                    // Get daily details for this line
                    try {
                      const details = await bcClient.getTimeSheetDetails(ts.number, line.lineNo);
                      const daysWithHours = details.filter((d) => d.quantity > 0);

                      if (daysWithHours.length > 0) {
                        // Create allocation block from timesheet line
                        const sortedDays = daysWithHours.sort(
                          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                        );
                        const blockStartDate = sortedDays[0].date;
                        const blockEndDate = sortedDays[sortedDays.length - 1].date;
                        const blockTotalHours = daysWithHours.reduce(
                          (sum, d) => sum + d.quantity,
                          0
                        );
                        const avgHoursPerDay = blockTotalHours / daysWithHours.length;

                        const allocation: AllocationBlock = {
                          id: `${ts.number}-${line.lineNo}`,
                          resourceId: resource.id,
                          resourceNumber: resource.number,
                          resourceName: resource.name || resource.displayName || resource.number,
                          projectId: line.jobNo || '',
                          projectNumber: line.jobNo || '',
                          projectName: projectNameMap.get(line.jobNo || '') || line.jobNo || '',
                          taskId: line.jobTaskNo,
                          taskNumber: line.jobTaskNo,
                          taskName: line.jobTaskNo,
                          startDate: blockStartDate,
                          endDate: blockEndDate,
                          hoursPerDay: avgHoursPerDay,
                          totalHours: blockTotalHours,
                          color: projectColorMap.get(line.jobNo || '') || '#6b7280',
                          timeSheetNo: ts.number,
                          lineNo: line.lineNo,
                          status: line.status,
                        };

                        resourceAllocations.push(allocation);
                        allAllocations.push(allocation);
                      }
                    } catch {
                      // Skip if can't get details
                    }
                  }
                } catch {
                  // Skip if can't get lines
                }
              }
            } catch {
              // Resource doesn't have a timesheet for this week
            }
          }

          // Derive UPN for profile photo
          let userPrincipalName: string | null = null;
          if (resource.timeSheetOwnerUserId && emailDomain) {
            userPrincipalName = `${resource.timeSheetOwnerUserId.toLowerCase()}@${emailDomain}`;
          }

          return {
            id: resource.id,
            number: resource.number,
            name: resource.name || resource.displayName || resource.number,
            timesheets,
            timesheetStatus: latestStatus,
            totalHours,
            isSelected: false,
            photoUrl: null,
            userPrincipalName,
            allocations: resourceAllocations,
          };
        })
      );

      // Build projects view from allocations
      const projectsMap = new Map<string, PlanProject>();
      for (const allocation of allAllocations) {
        if (!projectsMap.has(allocation.projectNumber)) {
          projectsMap.set(allocation.projectNumber, {
            id: allocation.projectId,
            number: allocation.projectNumber,
            name: allocation.projectName,
            color: allocation.color,
            allocations: [],
            totalHours: 0,
          });
        }
        const project = projectsMap.get(allocation.projectNumber)!;
        project.allocations.push(allocation);
        project.totalHours += allocation.totalHours;
      }

      set({
        teamMembers: membersWithTimesheets,
        projects: Array.from(projectsMap.values()),
        allAllocations,
        isLoading: false,
        selectedMemberIds: [],
        weeksToShow,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch team data';
      set({ error: message, isLoading: false, teamMembers: [], projects: [], allAllocations: [] });
    }
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
    resourceNumber: string,
    projectNumber: string,
    startDate: string,
    endDate: string,
    hoursPerDay: number
  ) => {
    // This would create a timesheet line - requires BC extension support
    // For now, return false as not implemented
    console.log('Create allocation:', {
      resourceNumber,
      projectNumber,
      startDate,
      endDate,
      hoursPerDay,
    });
    return false;
  },

  updateAllocation: async (
    allocationId: string,
    updates: Partial<Pick<AllocationBlock, 'startDate' | 'endDate' | 'hoursPerDay'>>
  ) => {
    // This would update timesheet details - requires BC extension support
    console.log('Update allocation:', allocationId, updates);
    return false;
  },

  deleteAllocation: async (allocationId: string) => {
    // This would delete a timesheet line - requires BC extension support
    console.log('Delete allocation:', allocationId);
    return false;
  },

  splitAllocation: async (allocationId: string, splitDate: string) => {
    // This would split an allocation into two parts
    console.log('Split allocation:', allocationId, 'at', splitDate);
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
