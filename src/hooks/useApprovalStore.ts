import { create } from 'zustand';
import type { BCTimeSheet, BCTimeSheetLine, ApprovalFilters } from '@/types';
import { bcClient } from '@/services/bc/bcClient';

interface ApprovalStore {
  // State
  pendingApprovals: BCTimeSheet[];
  selectedTimeSheet: BCTimeSheet | null;
  selectedLines: BCTimeSheetLine[];
  filters: ApprovalFilters;
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;

  // Permission state
  isApprover: boolean;
  approverResourceNumber: string | null;
  permissionChecked: boolean;

  // Stats
  pendingCount: number;
  pendingHours: number;

  // Actions
  fetchPendingApprovals: () => Promise<void>;
  fetchTimeSheetLines: (timeSheetNumber: string) => Promise<void>;
  selectTimeSheet: (timeSheet: BCTimeSheet | null) => void;
  setFilters: (filters: Partial<ApprovalFilters>) => void;
  clearFilters: () => void;

  // Approval actions
  approveTimeSheet: (timeSheetId: string, comment?: string) => Promise<boolean>;
  rejectTimeSheet: (timeSheetId: string, comment: string) => Promise<boolean>;
  approveLines: (lineIds: string[], comment?: string) => Promise<boolean>;
  rejectLines: (lineIds: string[], comment: string) => Promise<boolean>;
  bulkApprove: (timeSheetIds: string[], comment?: string) => Promise<boolean>;
  bulkReject: (timeSheetIds: string[], comment: string) => Promise<boolean>;

  // Permission check
  checkApprovalPermission: () => Promise<void>;

  // Stats
  refreshStats: () => Promise<void>;
}

export const useApprovalStore = create<ApprovalStore>((set, get) => ({
  // Initial state
  pendingApprovals: [],
  selectedTimeSheet: null,
  selectedLines: [],
  filters: {},
  isLoading: false,
  isProcessing: false,
  error: null,

  isApprover: false,
  approverResourceNumber: null,
  permissionChecked: false,

  pendingCount: 0,
  pendingHours: 0,

  // Fetch pending approvals
  fetchPendingApprovals: async () => {
    set({ isLoading: true, error: null });
    try {
      const approvals = await bcClient.getPendingApprovals();

      // Apply client-side filters if any
      const { filters } = get();
      let filtered = approvals;

      if (filters.employeeId) {
        filtered = filtered.filter((a) => a.resourceNumber === filters.employeeId);
      }
      if (filters.startDate) {
        filtered = filtered.filter((a) => a.startingDate >= filters.startDate!);
      }
      if (filters.endDate) {
        filtered = filtered.filter((a) => a.endingDate <= filters.endDate!);
      }

      const pendingCount = filtered.length;
      const pendingHours = filtered.reduce((sum, sheet) => sum + sheet.totalQuantity, 0);

      set({
        pendingApprovals: filtered,
        pendingCount,
        pendingHours,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch pending approvals';
      set({ error: message, isLoading: false, pendingApprovals: [] });
    }
  },

  // Fetch time sheet lines
  fetchTimeSheetLines: async (timeSheetNumber: string) => {
    set({ isLoading: true, error: null });
    try {
      const lines = await bcClient.getTimeSheetLines(timeSheetNumber);
      set({ selectedLines: lines, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch time sheet lines';
      set({ error: message, isLoading: false, selectedLines: [] });
    }
  },

  // Select a time sheet
  selectTimeSheet: (timeSheet: BCTimeSheet | null) => {
    set({ selectedTimeSheet: timeSheet, selectedLines: [] });
    if (timeSheet) {
      get().fetchTimeSheetLines(timeSheet.number);
    }
  },

  // Set filters
  setFilters: (filters: Partial<ApprovalFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    // Refresh approvals with new filters
    get().fetchPendingApprovals();
  },

  // Clear filters
  clearFilters: () => {
    set({ filters: {} });
    get().fetchPendingApprovals();
  },

  // Approve a time sheet
  approveTimeSheet: async (timeSheetId: string, comment?: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.approveTimeSheet(timeSheetId, comment);
      // Refresh the list
      await get().fetchPendingApprovals();
      set({ isProcessing: false, selectedTimeSheet: null, selectedLines: [] });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve time sheet';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Reject a time sheet
  rejectTimeSheet: async (timeSheetId: string, comment: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.rejectTimeSheet(timeSheetId, comment);
      // Refresh the list
      await get().fetchPendingApprovals();
      set({ isProcessing: false, selectedTimeSheet: null, selectedLines: [] });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject time sheet';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Approve specific lines
  approveLines: async (lineIds: string[], comment?: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.approveTimeSheetLines(lineIds, comment);
      // Refresh current time sheet lines
      const { selectedTimeSheet } = get();
      if (selectedTimeSheet) {
        await get().fetchTimeSheetLines(selectedTimeSheet.number);
      }
      await get().fetchPendingApprovals();
      set({ isProcessing: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve lines';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Reject specific lines
  rejectLines: async (lineIds: string[], comment: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.rejectTimeSheetLines(lineIds, comment);
      // Refresh current time sheet lines
      const { selectedTimeSheet } = get();
      if (selectedTimeSheet) {
        await get().fetchTimeSheetLines(selectedTimeSheet.number);
      }
      await get().fetchPendingApprovals();
      set({ isProcessing: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject lines';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Bulk approve
  bulkApprove: async (timeSheetIds: string[], comment?: string) => {
    set({ isProcessing: true, error: null });
    try {
      // Process approvals sequentially to avoid rate limiting
      for (const id of timeSheetIds) {
        await bcClient.approveTimeSheet(id, comment);
      }
      await get().fetchPendingApprovals();
      set({ isProcessing: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bulk approve';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Bulk reject
  bulkReject: async (timeSheetIds: string[], comment: string) => {
    set({ isProcessing: true, error: null });
    try {
      // Process rejections sequentially to avoid rate limiting
      for (const id of timeSheetIds) {
        await bcClient.rejectTimeSheet(id, comment);
      }
      await get().fetchPendingApprovals();
      set({ isProcessing: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bulk reject';
      set({ error: message, isProcessing: false });
      return false;
    }
  },

  // Check approval permission
  checkApprovalPermission: async () => {
    try {
      const result = await bcClient.checkApprovalPermission();
      set({
        isApprover: result.isApprover,
        approverResourceNumber: result.resourceNumber || null,
        permissionChecked: true,
      });
    } catch {
      set({
        isApprover: false,
        approverResourceNumber: null,
        permissionChecked: true,
      });
    }
  },

  // Refresh stats
  refreshStats: async () => {
    try {
      const stats = await bcClient.getApprovalStats();
      set({
        pendingCount: stats.pendingCount,
        pendingHours: stats.pendingHours,
      });
    } catch {
      // Silently fail - stats are non-critical
    }
  },
}));
