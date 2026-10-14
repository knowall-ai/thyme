'use client';

import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import type {
  BCPlanReview,
  BCPlanReviewChange,
  BCPlanReviewLine,
  BCPlanReviewRequest,
  PlanReviewSubjectType,
} from '@/types';
import { bcClient } from '@/services/bc';
import {
  applyPlanReviewChanges,
  buildUOMConversionMap,
  isOpenPlanReviewRequest,
  pickLatestPlanReviews,
  planReviewKey,
  type ApplyPlanChangesResult,
  type PlanCellWriter,
  type UOMConversionMap,
} from '@/utils';
import { useCompanyStore } from './useCompanyStore';

// Poppie sweeps changed plans on Thursdays; every couple of minutes is plenty to pick that up
export const PLAN_REVIEW_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
// While someone's request is open, follow it every few seconds (as Request suggestions does)
export const PLAN_REVIEW_REQUEST_POLL_MS = 5 * 1000;

/** The subjects and weeks on screen */
export interface PlanReviewScope {
  subjectType: PlanReviewSubjectType;
  subjectNos: string[];
  weekStarts: string[]; // Mondays, YYYY-MM-DD
}

/** A review's proposed changes: loaded on demand, when its findings are opened */
export type PlanReviewChangesState = BCPlanReviewChange[] | 'loading' | 'error';

interface PlanReviewStore {
  /** Whether the plan-review endpoints exist (null until the first answer); false hides them */
  available: boolean | null;
  /** The latest review per subject-week (planReviewKey) loaded so far */
  reviews: Record<string, BCPlanReview>;
  /** Subject-weeks whose reviews have been fetched */
  loaded: Record<string, true>;
  /** The latest request per subject-week: an open one, or one that failed */
  requests: Record<string, BCPlanReviewRequest>;
  /** Each loaded review's findings, by entry no. (a review never changes) */
  lines: Record<number, BCPlanReviewLine[]>;
  changes: Record<number, PlanReviewChangesState>;

  /** Load the reviews (and open requests) for the subjects and weeks on screen */
  load: (scope: PlanReviewScope, options?: { requestsOnly?: boolean }) => Promise<void>;
  /** Load reviews' proposed changes, unless they're loaded or loading */
  loadChanges: (entryNos: number[]) => Promise<void>;
  /** Ask Poppie to (re-)review a subject-week. Throws with a message to show. */
  requestReview: (
    subjectType: PlanReviewSubjectType,
    subjectNo: string,
    weekStart: string
  ) => Promise<void>;
  /** Apply a finding's changes (see applyPlanReviewChanges). Throws on BC errors. */
  applyChanges: (
    changes: BCPlanReviewChange[],
    uomConversionMap: UOMConversionMap
  ) => Promise<ApplyPlanChangesResult>;
  reset: () => void;
}

// Bumped on reset (company switch) so late responses from before it are dropped
let generation = 0;

function scopeKeys({ subjectType, subjectNos, weekStarts }: PlanReviewScope): string[] {
  return subjectNos.flatMap((no) => weekStarts.map((week) => planReviewKey(subjectType, no, week)));
}

// Planning lines written with the user's own credentials, through the Plan's usual calls
const bcCellWriter: PlanCellWriter = {
  getCellLines: (cell) => bcClient.getPlanningLinesForCell(cell),
  createLine: (params) => bcClient.createJobPlanningLine(params),
  updateLine: (id, quantity, etag) => bcClient.updateJobPlanningLine(id, { quantity }, etag),
  deleteLine: (id, etag) => bcClient.deleteJobPlanningLine(id, etag),
};

export const usePlanReviewStore = create<PlanReviewStore>((set, get) => ({
  available: null,
  reviews: {},
  loaded: {},
  requests: {},
  lines: {},
  changes: {},

  load: async (scope, options) => {
    if (get().available === false) return;
    const keys = scopeKeys(scope);
    if (keys.length === 0) return;
    const loadGeneration = generation;
    const isStale = () => loadGeneration !== generation;
    const { subjectType, subjectNos, weekStarts } = scope;

    // The latest reviews and their findings; false when the endpoints don't exist
    const fetchReviews = async (): Promise<Record<string, BCPlanReview> | false | null> => {
      const reviews = await bcClient.getPlanReviews(subjectType, subjectNos, weekStarts);
      if (isStale()) return null;
      if (reviews === undefined) return false;
      const latest = pickLatestPlanReviews(reviews);

      // Findings drive the day-cell dots, so load them with the reviews (once per review)
      const missing = [...new Set(Object.values(latest).map((review) => review.entryNo))].filter(
        (entryNo) => !(entryNo in get().lines)
      );
      if (missing.length > 0) {
        const lines = await bcClient.getPlanReviewLines(missing);
        if (isStale()) return null;
        if (lines === undefined) return false;
        const byEntry: Record<number, BCPlanReviewLine[]> = {};
        for (const entryNo of missing) byEntry[entryNo] = [];
        for (const line of lines) byEntry[line.reviewEntryNo]?.push(line);
        set((state) => ({ lines: { ...state.lines, ...byEntry } }));
      }
      return latest;
    };

    try {
      // Reviews first: on an extension without them, that's the only call
      let latest: Record<string, BCPlanReview> | null = null;
      if (!options?.requestsOnly) {
        const result = await fetchReviews();
        if (result === null) return;
        if (result === false) {
          set({ available: false });
          return;
        }
        latest = result;
      }

      // Requests that were open: if one has finished, its review is worth fetching now
      const previouslyOpen = keys
        .map((key) => get().requests[key])
        .filter((request): request is BCPlanReviewRequest => !!request)
        .filter(isOpenPlanReviewRequest);

      const openRequests =
        (await bcClient.getPlanReviewRequests(subjectType, subjectNos, weekStarts)) ?? [];
      if (isStale()) return;
      const openByKey = new Map<string, BCPlanReviewRequest>();
      for (const request of openRequests) {
        const key = planReviewKey(request.subjectType, request.subjectNo, request.weekStart);
        const current = openByKey.get(key);
        if (!current || request.entryNo > current.entryNo) openByKey.set(key, request);
      }

      // How each request that's no longer open ended (Done, or Failed with a reason)
      const finished = previouslyOpen.filter(
        (request) =>
          openByKey.get(planReviewKey(request.subjectType, request.subjectNo, request.weekStart))
            ?.id !== request.id
      );
      const ended = await Promise.all(
        finished.map((request) =>
          bcClient
            .getPlanReviewRequest(request.id)
            .catch(() => ({ ...request, status: 'Done' as const }))
        )
      );
      if (isStale()) return;

      if (!latest && finished.length > 0) {
        const result = await fetchReviews();
        if (result === null) return;
        if (result === false) {
          set({ available: false });
          return;
        }
        latest = result;
      }

      set((state) => {
        const requests = { ...state.requests };
        for (const key of keys) {
          const open = openByKey.get(key);
          if (open) {
            requests[key] = open;
          } else if (requests[key] && isOpenPlanReviewRequest(requests[key])) {
            delete requests[key];
          }
        }
        // A failed request stays to say why; a done one gives way to its review
        for (const request of ended) {
          const key = planReviewKey(request.subjectType, request.subjectNo, request.weekStart);
          if (openByKey.has(key)) continue;
          if (request.status === 'Failed') requests[key] = request;
          else delete requests[key];
        }

        if (!latest) return { requests };
        const reviews = { ...state.reviews };
        const loaded = { ...state.loaded };
        for (const key of keys) {
          if (latest[key]) reviews[key] = latest[key];
          else delete reviews[key];
          loaded[key] = true;
        }
        return { available: true, reviews, loaded, requests };
      });
    } catch (error) {
      if (isStale()) return;
      // Reviews are advice: keep the Plan usable and whatever was on screen
      console.warn('[Plan] Failed to load plan reviews:', error);
    }
  },

  loadChanges: async (entryNos) => {
    const wanted = entryNos.filter((entryNo) => {
      const state = get().changes[entryNo];
      return state === undefined || state === 'error';
    });
    if (wanted.length === 0) return;
    const loadGeneration = generation;
    const mark = (value: PlanReviewChangesState) =>
      Object.fromEntries(wanted.map((entryNo) => [entryNo, value]));
    set((state) => ({ changes: { ...state.changes, ...mark('loading') } }));
    try {
      const changes = await bcClient.getPlanReviewChanges(wanted);
      if (loadGeneration !== generation) return;
      const byEntry: Record<number, BCPlanReviewChange[]> = {};
      for (const entryNo of wanted) byEntry[entryNo] = [];
      // No changes API: the findings still show, just without one-click fixes
      for (const change of changes ?? []) byEntry[change.reviewEntryNo]?.push(change);
      set((state) => ({ changes: { ...state.changes, ...byEntry } }));
    } catch (error) {
      if (loadGeneration !== generation) return;
      console.warn('[Plan] Failed to load plan review changes:', error);
      set((state) => ({ changes: { ...state.changes, ...mark('error') } }));
    }
  },

  requestReview: async (subjectType, subjectNo, weekStart) => {
    const key = planReviewKey(subjectType, subjectNo, weekStart);
    const requestGeneration = generation;
    try {
      const created = await bcClient.createPlanReviewRequest(subjectType, subjectNo, weekStart);
      if (requestGeneration !== generation) return;
      set((state) => ({ requests: { ...state.requests, [key]: created } }));
    } catch (error) {
      if (requestGeneration !== generation) return;
      // Someone (maybe in another tab) already asked: follow their request instead
      const open = await bcClient
        .getPlanReviewRequests(subjectType, [subjectNo], [weekStart])
        .catch(() => undefined);
      if (requestGeneration !== generation) return;
      const existing = open?.find(isOpenPlanReviewRequest);
      if (existing) {
        set((state) => ({ requests: { ...state.requests, [key]: existing } }));
        return;
      }
      throw new Error(
        error instanceof Error && /not allowed|permission/i.test(error.message)
          ? "You can't ask Poppie to review this plan."
          : "Couldn't ask Poppie to review. Please try again."
      );
    }
  },

  applyChanges: async (changes, uomConversionMap) => {
    // Writing needs the real units: an empty cached map is fetched strictly instead
    const uomMap =
      uomConversionMap.size > 0
        ? uomConversionMap
        : buildUOMConversionMap(await bcClient.getResourceUnitsOfMeasure({ strict: true }));
    return applyPlanReviewChanges(changes, uomMap, bcCellWriter);
  },

  reset: () => {
    generation += 1;
    set({ available: null, reviews: {}, loaded: {}, requests: {}, lines: {}, changes: {} });
  },
}));

// Reviews belong to a company: drop them when the company changes
useCompanyStore.subscribe((state, prev) => {
  if (state.companyVersion !== prev.companyVersion) {
    usePlanReviewStore.getState().reset();
  }
});

function isPageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Keep the plan reviews for the subjects and weeks on screen loaded: on any change of scope,
 * every PLAN_REVIEW_REFRESH_INTERVAL_MS, and every few seconds while a request is open (so
 * "Queued…" turns into "Reviewing…" and then the new review). Null scope: nothing to load.
 */
export function usePlanReviews(scope: PlanReviewScope | null) {
  const load = usePlanReviewStore((state) => state.load);
  const requests = usePlanReviewStore((state) => state.requests);
  const companyVersion = useCompanyStore((state) => state.companyVersion);

  // A stable identity for the scope, so a re-render with the same subjects doesn't reload
  const scopeId = scope
    ? `${scope.subjectType}:${scope.subjectNos.join(',')}:${scope.weekStarts.join(',')}`
    : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeId is the scope's identity
  const stableScope = useMemo(() => scope, [scopeId]);

  const hasOpenRequest = useMemo(() => {
    if (!stableScope) return false;
    return scopeKeys(stableScope).some((key) => {
      const request = requests[key];
      return !!request && isOpenPlanReviewRequest(request);
    });
  }, [stableScope, requests]);

  const lastFullLoad = useRef(0);

  useEffect(() => {
    if (!stableScope || stableScope.subjectNos.length === 0) return;
    lastFullLoad.current = Date.now();
    void load(stableScope);
  }, [stableScope, load, companyVersion]);

  useEffect(() => {
    if (!stableScope || stableScope.subjectNos.length === 0) return;
    const interval = hasOpenRequest ? PLAN_REVIEW_REQUEST_POLL_MS : PLAN_REVIEW_REFRESH_INTERVAL_MS;
    const timer = setInterval(() => {
      if (isPageHidden()) return;
      const due = Date.now() - lastFullLoad.current >= PLAN_REVIEW_REFRESH_INTERVAL_MS;
      if (due) lastFullLoad.current = Date.now();
      void load(stableScope, { requestsOnly: !due });
    }, interval);
    return () => clearInterval(timer);
  }, [stableScope, hasOpenRequest, load]);
}
