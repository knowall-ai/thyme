import { create } from 'zustand';
import type { BCTimeSheet, BCTimeSheetLine, ApprovalFilters, BCResource } from '@/types';
import { bcClient, ExtensionNotInstalledError } from '@/services/bc';
import { getTimesheetDisplayStatus } from '@/utils';

interface ApprovalStore {
  // State
  allApprovals: BCTimeSheet[]; // Unfiltered list for deriving filter options
  pendingApprovals: BCTimeSheet[]; // Filtered list for display
  resources: BCResource[]; // All resources for filter dropdown
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
  extensionNotInstalled: boolean;

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
  allApprovals: [],
  pendingApprovals: [],
  resources: [],
  selectedTimeSheet: null,
  selectedLines: [],
  filters: {},
  isLoading: false,
  isProcessing: false,
  error: null,

  isApprover: false,
  approverResourceNumber: null,
  permissionChecked: false,
  extensionNotInstalled: false,

  pendingCount: 0,
  pendingHours: 0,

  // Fetch pending approvals and resources
  // TODO: Consider server-side filtering if the API supports OData $filter
  // to improve performance for large datasets. Currently using client-side
  // filtering which fetches all data then filters locally.
  fetchPendingApprovals: async () => {
    set({ isLoading: true, error: null });
    try {
      // Fetch approvals and (if needed) resources in parallel.
      // Note: bcClient.getPendingApprovals() already calls getResources()
      // internally to enrich timesheets. To avoid an extra network call on
      // every refresh/filter change, only fetch resources explicitly when
      // we don't already have them in the store.
      const { resources: existingResources, filters } = get();
      const resourcesPromise: Promise<BCResource[]> =
        existingResources.length === 0
          ? bcClient.getResources().catch((err) => {
              console.warn('Failed to fetch resources for filter dropdown:', err);
              return [] as BCResource[];
            })
          : Promise.resolve(existingResources);

      const [approvals, resources] = await Promise.all([
        bcClient.getPendingApprovals(),
        resourcesPromise,
      ]);
      let filtered = approvals;

      if (filters.resourceId) {
        filtered = filtered.filter((a) => a.resourceNo === filters.resourceId);
      }
      if (filters.startDate) {
        filtered = filtered.filter((a) => a.startingDate >= filters.startDate!);
      }
      if (filters.endDate) {
        filtered = filtered.filter((a) => a.endingDate <= filters.endDate!);
      }
      if (filters.status) {
        filtered = filtered.filter((a) => getTimesheetDisplayStatus(a) === filters.status);
      }

      const pendingCount = filtered.length;
      const pendingHours = filtered.reduce((sum, sheet) => sum + (sheet.totalQuantity || 0), 0);

      set({
        allApprovals: approvals,
        pendingApprovals: filtered,
        resources,
        pendingCount,
        pendingHours,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch pending approvals';
      set({
        error: message,
        isLoading: false,
        allApprovals: [],
        pendingApprovals: [],
        resources: [],
      });
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
  // Note: The BC API doesn't support comments on approval currently
  approveTimeSheet: async (timeSheetId: string, _comment?: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.approveTimeSheet(timeSheetId);
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
  // Note: The BC API doesn't support comments on rejection currently
  rejectTimeSheet: async (timeSheetId: string, _comment: string) => {
    set({ isProcessing: true, error: null });
    try {
      await bcClient.rejectTimeSheet(timeSheetId);
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

  // Bulk approve with partial success handling
  // Note: The BC API doesn't support comments on approval currently
  bulkApprove: async (timeSheetIds: string[], _comment?: string) => {
    set({ isProcessing: true, error: null });
    const succeeded: string[] = [];
    const failed: string[] = [];

    // Process in small concurrent batches to balance performance and rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < timeSheetIds.length; i += BATCH_SIZE) {
      const batch = timeSheetIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((id) => bcClient.approveTimeSheet(id)));

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.push(batch[index]);
        } else {
          failed.push(batch[index]);
        }
      });
    }

    await get().fetchPendingApprovals();
    set({ isProcessing: false });

    if (failed.length > 0) {
      const errorMsg =
        succeeded.length > 0
          ? `Partially completed: ${succeeded.length} approved, ${failed.length} failed`
          : `Failed to approve ${failed.length} timesheet(s)`;
      set({ error: errorMsg });
      return false;
    }
    return true;
  },

  // Bulk reject with partial success handling
  // Note: The BC API doesn't support comments on rejection currently
  bulkReject: async (timeSheetIds: string[], _comment: string) => {
    set({ isProcessing: true, error: null });
    const succeeded: string[] = [];
    const failed: string[] = [];

    // Process in small concurrent batches to balance performance and rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < timeSheetIds.length; i += BATCH_SIZE) {
      const batch = timeSheetIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((id) => bcClient.rejectTimeSheet(id)));

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded.push(batch[index]);
        } else {
          failed.push(batch[index]);
        }
      });
    }

    await get().fetchPendingApprovals();
    set({ isProcessing: false });

    if (failed.length > 0) {
      const errorMsg =
        succeeded.length > 0
          ? `Partially completed: ${succeeded.length} rejected, ${failed.length} failed`
          : `Failed to reject ${failed.length} timesheet(s)`;
      set({ error: errorMsg });
      return false;
    }
    return true;
  },

  // Check approval permission
  checkApprovalPermission: async () => {
    try {
      const result = await bcClient.checkApprovalPermission();
      set({
        isApprover: result.isApprover,
        approverResourceNumber: result.resourceNumber || null,
        permissionChecked: true,
        extensionNotInstalled: false,
      });
    } catch (error) {
      const isExtensionError = error instanceof ExtensionNotInstalledError;
      set({
        isApprover: false,
        approverResourceNumber: null,
        permissionChecked: true,
        extensionNotInstalled: isExtensionError,
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
