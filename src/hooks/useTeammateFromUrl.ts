'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTeammateStore } from './useTeammateStore';
import { parseResourceParam, resolveTeammateParam, RESOURCE_PARAM } from '@/utils/teammateParam';

/** The `resource=` the page was opened with, read straight from the address bar. */
function readResourceParamOnArrival(): string | null {
  if (typeof window === 'undefined') return null;
  return parseResourceParam(new URLSearchParams(window.location.search).get(RESOURCE_PARAM));
}

/**
 * Open the teammate named by the URL's `resource=` when the Time page loads, once a
 * fresh teammate list is in. A resource the viewer can't pick (or a failed load) falls
 * back to their own timesheet with a toast saying why.
 *
 * Returns true once that's settled (straight away when there's no `resource=`), so the
 * page can hold off loading a timesheet, and writing the selection back to the URL,
 * until it knows whose timesheet to show.
 */
export function useTeammateFromUrl(currentUserEmail?: string): boolean {
  // The teammate the URL asked for on arrival; null once handled, or if there was none
  const [pendingResourceNo, setPendingResourceNo] = useState(readResourceParamOnArrival);
  // Only a list that finishes loading after arrival counts: one already in the store
  // may be from before a company switch
  const [arrivalLoadCount] = useState(() => useTeammateStore.getState().loadCount);

  const teammates = useTeammateStore((state) => state.teammates);
  const selectedTeammate = useTeammateStore((state) => state.selectedTeammate);
  const loadCount = useTeammateStore((state) => state.loadCount);
  const loadError = useTeammateStore((state) => state.error);
  const selectTeammate = useTeammateStore((state) => state.selectTeammate);
  const clearSelection = useTeammateStore((state) => state.clearSelection);

  useEffect(() => {
    if (!pendingResourceNo) return;

    // Already showing them (e.g. back on the Time page with the same selection)
    if (selectedTeammate?.resourceNo.toUpperCase() === pendingResourceNo) {
      setPendingResourceNo(null);
      return;
    }
    // Someone else is still selected from earlier: don't show them while we wait
    if (selectedTeammate) clearSelection();
    if (loadCount === arrivalLoadCount) return;

    const result = resolveTeammateParam(pendingResourceNo, teammates, {
      currentUserEmail,
      loadError,
    });
    if (result.kind === 'teammate') {
      selectTeammate(result.teammate);
    } else if (result.kind === 'fallback') {
      toast(result.message);
    }
    setPendingResourceNo(null);
  }, [
    pendingResourceNo,
    selectedTeammate,
    loadCount,
    arrivalLoadCount,
    teammates,
    loadError,
    currentUserEmail,
    selectTeammate,
    clearSelection,
  ]);

  return pendingResourceNo === null;
}
