'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { bcClient } from '@/services/bc/bcClient';
import type { BCSuggestionRequest } from '@/types';
import { formatDate, getWeekEnd } from '@/utils';
import { isOpenRequest } from '@/utils/suggestionRequests';

// Poppie updates progress as she checks each source; every few seconds keeps it live
export const REQUEST_POLL_INTERVAL_MS = 5 * 1000;

export interface SuggestionRequestState {
  /** True when the extension has the API and the signed-in user may request for this resource */
  canRequest: boolean;
  /** The latest request for this resource and week (null: none yet) */
  request: BCSuggestionRequest | null;
  /** A request finished (Done or Failed) while this week was on screen */
  finishedHere: boolean;
  isSubmitting: boolean;
  error: string | null;
  requestSuggestions: () => Promise<void>;
}

/**
 * Lets the user ask Poppie to generate suggestions for the resource and week on screen,
 * and follows the request while she works: polls it every few seconds while it's open,
 * and calls onFinished when it reaches Done or Failed (so the suggestions can refresh).
 * Hidden (canRequest false) on extensions without the suggestionRequests API, and for
 * people BC says may not request for this resource.
 */
export function useSuggestionRequest(
  resourceNo: string | null | undefined,
  weekStart: Date,
  onFinished?: (request: BCSuggestionRequest) => void
): SuggestionRequestState {
  const fromDate = formatDate(weekStart);
  const toDate = formatDate(getWeekEnd(weekStart));

  const [canRequest, setCanRequest] = useState(false);
  const [request, setRequest] = useState<BCSuggestionRequest | null>(null);
  const [finishedHere, setFinishedHere] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every resource/week change, so a slow load or poll for the previous week is dropped
  const scopeRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  // New resource or week: find out whether requesting is possible, and any request already made
  useEffect(() => {
    const scope = ++scopeRef.current;
    setCanRequest(false);
    setRequest(null);
    setFinishedHere(false);
    setError(null);
    if (!resourceNo) return;

    (async () => {
      try {
        // Settled separately: a failed permission read mustn't stop an open request resuming
        const [latestResult, allowedResult] = await Promise.allSettled([
          bcClient.getLatestSuggestionRequest(resourceNo, fromDate, toDate),
          bcClient.canRequestSuggestions(resourceNo),
        ]);
        if (scope !== scopeRef.current) return;
        const latest = latestResult.status === 'fulfilled' ? latestResult.value : undefined;
        const allowed = allowedResult.status === 'fulfilled' ? allowedResult.value : undefined;
        // undefined = the extension has no suggestionRequests API yet: keep the feature hidden
        setCanRequest(latest !== undefined && allowed === true);
        setRequest(latest ?? null);
      } catch {
        // Not being able to ask is no reason to disturb the timesheet: just hide the button
        if (scope === scopeRef.current) setCanRequest(false);
      }
    })();
  }, [resourceNo, fromDate, toDate]);

  // Follow an open request until Poppie finishes it
  const openId = request && isOpenRequest(request) ? request.id : null;
  useEffect(() => {
    if (!openId) return;
    const scope = scopeRef.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const latest = await bcClient.getSuggestionRequest(openId);
        if (stopped || scope !== scopeRef.current) return;
        setRequest(latest);
        if (!isOpenRequest(latest)) {
          setFinishedHere(true);
          onFinishedRef.current?.(latest);
          return;
        }
      } catch {
        // A blip (or token refresh) shouldn't end the wait: try again next interval
      }
      if (!stopped) timer = setTimeout(poll, REQUEST_POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, REQUEST_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [openId]);

  const requestSuggestions = useCallback(async () => {
    if (!resourceNo || isSubmitting) return;
    const scope = scopeRef.current;
    setIsSubmitting(true);
    setError(null);
    setFinishedHere(false);
    try {
      const created = await bcClient.createSuggestionRequest(resourceNo, fromDate, toDate);
      if (scope === scopeRef.current) setRequest(created);
    } catch (err) {
      if (scope !== scopeRef.current) return;
      // Someone (maybe in another tab) already asked for this week: follow that request instead
      const latest = await bcClient
        .getLatestSuggestionRequest(resourceNo, fromDate, toDate)
        .catch(() => undefined);
      if (scope !== scopeRef.current) return;
      if (latest && isOpenRequest(latest)) {
        setRequest(latest);
      } else {
        setError(
          err instanceof Error && /not allowed/i.test(err.message)
            ? "You can't request suggestions for this timesheet."
            : "Couldn't ask Poppie for suggestions. Please try again."
        );
      }
    } finally {
      if (scope === scopeRef.current) setIsSubmitting(false);
    }
  }, [resourceNo, fromDate, toDate, isSubmitting]);

  return { canRequest, request, finishedHere, isSubmitting, error, requestSuggestions };
}
