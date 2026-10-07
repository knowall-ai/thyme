'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bcClient } from '@/services/bc/bcClient';
import type { BCTimeSuggestion, BCTimeSuggestionUpdate } from '@/types';
import { formatDate, getWeekEnd } from '@/utils';
import { buildAcceptUpdate, buildDismissUpdate } from '@/utils/timeSuggestions';

// Poppie writes suggestions through the day, so re-check every few minutes while visible
export const SUGGESTIONS_POLL_INTERVAL_MS = 5 * 60 * 1000;
// Don't refetch on every focus flicker (e.g. alt-tabbing back and forth)
const MIN_FOCUS_REFETCH_GAP_MS = 30 * 1000;

export interface TimeSuggestionsState {
  /** Pending suggestions for the week, minus any actioned in this session */
  suggestions: BCTimeSuggestion[];
  /** True until the first load for this resource and week finishes */
  isLoading: boolean;
  /** False when the extension has no timeSuggestions endpoint, so the panel can hide */
  isAvailable: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Mark a suggestion accepted, recording the timesheet line it became */
  accept: (
    suggestion: BCTimeSuggestion,
    timeSheetNo: string,
    timeSheetLineNo: number | null
  ) => Promise<void>;
  /** Mark a suggestion dismissed; it leaves the list straight away */
  dismiss: (suggestion: BCTimeSuggestion) => Promise<void>;
  /** Undo a dismiss, putting the suggestion back to Pending */
  restore: (suggestion: BCTimeSuggestion) => Promise<void>;
}

/**
 * Loads Poppie's pending time suggestions for a resource and week, and keeps them
 * fresh: on week change, on window focus, and every few minutes while the page is
 * visible. Accept/dismiss write the status back to BC and update the list at once.
 */
export function useTimeSuggestions(
  resourceNo: string | null | undefined,
  weekStart: Date
): TimeSuggestionsState {
  const fromDate = formatDate(weekStart);
  const toDate = formatDate(getWeekEnd(weekStart));

  const [suggestions, setSuggestions] = useState<BCTimeSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Latest load, so a slower earlier one (e.g. the previous week) can't overwrite it
  const fetchSeqRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  // Suggestions actioned here, so a refetch that started before the write can't bring them back
  const actionedIdsRef = useRef(new Set<string>());
  // Latest ETag per suggestion: each PATCH returns a new one, which an undo needs
  const etagsRef = useRef(new Map<string, string>());

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!resourceNo) return;
      const seq = ++fetchSeqRef.current;
      lastFetchAtRef.current = Date.now();
      if (showLoading) setIsLoading(true);
      try {
        const result = await bcClient.getTimeSuggestions(resourceNo, fromDate, toDate);
        if (seq !== fetchSeqRef.current) return;
        if (result === null) {
          setIsAvailable(false);
          setSuggestions([]);
        } else {
          setIsAvailable(true);
          for (const s of result) {
            if (s['@odata.etag']) etagsRef.current.set(s.id, s['@odata.etag']);
          }
          setSuggestions(result.filter((s) => !actionedIdsRef.current.has(s.id)));
        }
        setError(null);
      } catch (err) {
        if (seq !== fetchSeqRef.current) return;
        // Keep whatever is already showing; a background refresh failing isn't worth a toast
        setError(err instanceof Error ? err.message : 'Failed to load suggestions');
      } finally {
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    },
    [resourceNo, fromDate, toDate]
  );

  const refetch = useCallback(() => load(false), [load]);

  // New resource or week: start from a clean slate
  useEffect(() => {
    setSuggestions([]);
    setError(null);
    actionedIdsRef.current = new Set();
    if (!resourceNo) {
      fetchSeqRef.current++;
      setIsLoading(false);
      return;
    }
    load(true);
  }, [resourceNo, load]);

  // Keep fresh while the page is in front of the person
  useEffect(() => {
    if (!resourceNo) return;

    const isVisible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';

    const refetchIfStale = () => {
      if (!isVisible()) return;
      if (Date.now() - lastFetchAtRef.current < MIN_FOCUS_REFETCH_GAP_MS) return;
      load(false);
    };

    const interval = setInterval(() => {
      if (isVisible()) load(false);
    }, SUGGESTIONS_POLL_INTERVAL_MS);

    window.addEventListener('focus', refetchIfStale);
    document.addEventListener('visibilitychange', refetchIfStale);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refetchIfStale);
      document.removeEventListener('visibilitychange', refetchIfStale);
    };
  }, [resourceNo, load]);

  const removeLocally = useCallback((id: string) => {
    actionedIdsRef.current.add(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const putBackLocally = useCallback((suggestion: BCTimeSuggestion) => {
    actionedIdsRef.current.delete(suggestion.id);
    setSuggestions((prev) =>
      prev.some((s) => s.id === suggestion.id) ? prev : [...prev, suggestion]
    );
  }, []);

  const writeStatus = useCallback(
    async (suggestion: BCTimeSuggestion, update: BCTimeSuggestionUpdate) => {
      const etag = etagsRef.current.get(suggestion.id) ?? suggestion['@odata.etag'];
      const updated = await bcClient.updateTimeSuggestion(suggestion.id, update, etag);
      if (updated?.['@odata.etag']) etagsRef.current.set(suggestion.id, updated['@odata.etag']);
    },
    []
  );

  const accept = useCallback(
    async (suggestion: BCTimeSuggestion, timeSheetNo: string, timeSheetLineNo: number | null) => {
      // The entry already exists by now, so it leaves the list even if the write-back
      // fails; the week's duplicate check keeps it hidden until Poppie catches up.
      removeLocally(suggestion.id);
      await writeStatus(suggestion, buildAcceptUpdate(timeSheetNo, timeSheetLineNo));
    },
    [removeLocally, writeStatus]
  );

  const dismiss = useCallback(
    async (suggestion: BCTimeSuggestion) => {
      removeLocally(suggestion.id);
      try {
        await writeStatus(suggestion, buildDismissUpdate());
      } catch (err) {
        putBackLocally(suggestion);
        throw err;
      }
    },
    [removeLocally, putBackLocally, writeStatus]
  );

  const restore = useCallback(
    async (suggestion: BCTimeSuggestion) => {
      await writeStatus(suggestion, { status: 'Pending' });
      putBackLocally(suggestion);
    },
    [putBackLocally, writeStatus]
  );

  return { suggestions, isLoading, isAvailable, error, refetch, accept, dismiss, restore };
}
