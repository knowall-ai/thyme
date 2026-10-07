'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTeammateStore } from './useTeammateStore';
import { useTimeEntriesStore } from './useTimeEntriesStore';
import {
  invalidResourceParamMessage,
  parseResourceParam,
  resolveTeammateParam,
  RESOURCE_PARAM,
} from '@/utils/teammateParam';

/** One toast id, so React's double-run effects in development can't show it twice */
const TOAST_ID = 'teammate-from-url';

/** The raw `resource=` the page was opened with (null if absent), from the address bar. */
function readRawResourceParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(RESOURCE_PARAM);
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
  const [rawResourceParam] = useState(readRawResourceParam);
  // The teammate the URL asked for on arrival; null once handled, or if there was none.
  // Nothing to do if they're already selected (e.g. back on the Time page with them).
  const [pendingResourceNo, setPendingResourceNo] = useState(() => {
    const resourceNo = parseResourceParam(rawResourceParam);
    const selected = useTeammateStore.getState().selectedTeammate;
    return selected?.resourceNo.toUpperCase() === resourceNo ? null : resourceNo;
  });
  // Only a list that finishes loading after arrival counts: one already in the store
  // may be from before a company switch
  const [arrivalLoadCount] = useState(() => useTeammateStore.getState().loadCount);

  // A `resource=` that can't be a resource number: say so; the page then shows your own
  // timesheet and drops it from the URL
  useEffect(() => {
    if (rawResourceParam !== null && !parseResourceParam(rawResourceParam)) {
      toast(invalidResourceParamMessage(rawResourceParam), { id: TOAST_ID });
    }
  }, [rawResourceParam]);

  useEffect(() => {
    if (!pendingResourceNo) return;

    // Don't show whoever was on screen earlier (their name or their entries) while we
    // wait. clearEntries also drops any of their loads still in flight; the week stays.
    useTeammateStore.getState().clearSelection();
    useTimeEntriesStore.getState().clearEntries();
    useTimeEntriesStore.setState({ isLoading: true });

    let settled = false;
    const resolveOnceLoaded = (state: ReturnType<typeof useTeammateStore.getState>) => {
      if (settled || state.loadCount === arrivalLoadCount) return;
      settled = true;
      const result = resolveTeammateParam(pendingResourceNo, state.teammates, {
        currentUserEmail,
        loadError: state.error,
      });
      if (result.kind === 'teammate') {
        state.selectTeammate(result.teammate);
      } else if (result.kind === 'fallback') {
        toast(result.message, { id: TOAST_ID });
      }
      setPendingResourceNo(null);
    };

    // The list may already have finished loading since this render
    const unsubscribe = useTeammateStore.subscribe(resolveOnceLoaded);
    resolveOnceLoaded(useTeammateStore.getState());
    return unsubscribe;
  }, [pendingResourceNo, arrivalLoadCount, currentUserEmail]);

  return pendingResourceNo === null;
}
