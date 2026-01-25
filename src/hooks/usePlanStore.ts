import { create } from 'zustand';
import type { BCResource, BCTimeSheet, TimesheetDisplayStatus } from '@/types';
import { bcClient } from '@/services/bc/bcClient';
import { getTimesheetDisplayStatus } from '@/utils';

export interface PlanTeamMember {
  id: string;
  number: string;
  name: string;
  timesheet: BCTimeSheet | null;
  timesheetStatus: TimesheetDisplayStatus | 'No Timesheet';
  totalHours: number;
  isSelected: boolean;
  photoUrl: string | null;
  userPrincipalName: string | null;
}

interface PlanStore {
  // State
  teamMembers: PlanTeamMember[];
  isLoading: boolean;
  isCreatingTimesheets: boolean;
  error: string | null;
  currentWeekStart: Date;

  // Selection
  selectedMemberIds: string[];

  // Actions
  fetchTeamMembers: (weekStart: Date, emailDomain?: string) => Promise<void>;
  setCurrentWeekStart: (date: Date) => void;
  toggleMemberSelection: (memberId: string) => void;
  selectAllWithoutTimesheet: () => void;
  clearSelection: () => void;
  createTimesheetsForSelected: () => Promise<{
    success: number;
    failed: number;
    errors: string[];
  }>;
  updateMemberPhoto: (memberId: string, photoUrl: string) => void;
}

export const usePlanStore = create<PlanStore>((set, get) => ({
  // Initial state
  teamMembers: [],
  isLoading: false,
  isCreatingTimesheets: false,
  error: null,
  currentWeekStart: new Date(),
  selectedMemberIds: [],

  // Fetch team members and their timesheet status
  fetchTeamMembers: async (weekStart: Date, emailDomain?: string) => {
    set({ isLoading: true, error: null });
    try {
      // Get all person resources
      const resources = await bcClient.getResources();

      // Get timesheets for the week for all resources
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Fetch timesheet data for each resource in parallel
      const membersWithTimesheets = await Promise.all(
        resources.map(async (resource: BCResource) => {
          let timesheet: BCTimeSheet | null = null;
          let timesheetStatus: TimesheetDisplayStatus | 'No Timesheet' = 'No Timesheet';
          let totalHours = 0;

          try {
            const timesheets = await bcClient.getTimeSheets(resource.number, weekStartStr);
            if (timesheets.length > 0) {
              timesheet = timesheets[0];
              timesheetStatus = getTimesheetDisplayStatus(timesheet);
              totalHours = timesheet.totalQuantity || 0;
            }
          } catch {
            // Resource doesn't have a timesheet for this week - that's expected
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
            timesheet,
            timesheetStatus,
            totalHours,
            isSelected: false,
            photoUrl: null,
            userPrincipalName,
          };
        })
      );

      set({
        teamMembers: membersWithTimesheets,
        isLoading: false,
        selectedMemberIds: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch team members';
      set({ error: message, isLoading: false, teamMembers: [] });
    }
  },

  // Set current week
  setCurrentWeekStart: (date: Date) => {
    set({ currentWeekStart: date, selectedMemberIds: [] });
  },

  // Toggle member selection
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

  // Select all members without a timesheet
  selectAllWithoutTimesheet: () => {
    set((state) => ({
      selectedMemberIds: state.teamMembers
        .filter((m) => m.timesheetStatus === 'No Timesheet')
        .map((m) => m.id),
    }));
  },

  // Clear selection
  clearSelection: () => {
    set({ selectedMemberIds: [] });
  },

  // Create timesheets for selected members
  createTimesheetsForSelected: async () => {
    const { selectedMemberIds, teamMembers, currentWeekStart } = get();

    if (selectedMemberIds.length === 0) {
      return { success: 0, failed: 0, errors: ['No members selected'] };
    }

    set({ isCreatingTimesheets: true, error: null });

    const weekStartStr = currentWeekStart.toISOString().split('T')[0];
    const resourceNos = selectedMemberIds
      .map((id) => teamMembers.find((m) => m.id === id)?.number)
      .filter((no): no is string => !!no);

    const results = await bcClient.createTimeSheetsForResources(resourceNos, weekStartStr);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Update the team members with new timesheet data
    set((state) => ({
      teamMembers: state.teamMembers.map((member) => {
        const result = results.find((r) => r.resourceNo === member.number);
        if (result?.success && result.timesheet) {
          return {
            ...member,
            timesheet: result.timesheet,
            timesheetStatus: getTimesheetDisplayStatus(result.timesheet),
          };
        }
        return member;
      }),
      isCreatingTimesheets: false,
      selectedMemberIds: [],
    }));

    return {
      success: successes.length,
      failed: failures.length,
      errors: failures.map((f) => `${f.resourceNo}: ${f.error}`),
    };
  },

  // Update member photo URL (called after async photo fetch)
  updateMemberPhoto: (memberId: string, photoUrl: string) => {
    set((state) => ({
      teamMembers: state.teamMembers.map((member) =>
        member.id === memberId ? { ...member, photoUrl } : member
      ),
    }));
  },
}));
