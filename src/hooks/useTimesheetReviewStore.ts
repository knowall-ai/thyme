import { create } from 'zustand';
import type { BCTimesheetReview, BCTimesheetReviewLine, BCTimesheetReviewRequest } from '@/types';
import { bcClient } from '@/services/bc/bcClient';
import { isOpenTimesheetReviewRequest, pickLatestReviews } from '@/utils';
import { useCompanyStore } from './useCompanyStore';

// How often timesheets waiting on the agent are re-checked (it reviews every ~10 minutes)
export const REVIEW_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
// While someone's "look again" request is open, follow it every few seconds (as plan review
// requests do), so the agent's progress shows as it works
export const REVIEW_REQUEST_POLL_MS = 5 * 1000;
// Window focus refreshes are skipped if the last one was this recent
const FOCUS_REFRESH_MIN_GAP_MS = 30 * 1000;
// Timesheets per request, keeping the OR-filter URL well under BC's length limit
const BATCH_SIZE = 15;

export interface CachedTimesheetReview {
  /** The newest review, or null when the agent hasn't reviewed the timesheet */
  review: BCTimesheetReview | null;
  notes: BCTimesheetReviewLine[];
  fetchedAt: number;
}

interface TimesheetReviewStore {
  /** Whether the review endpoints exist (null until the first response) */
  available: boolean | null;
  reviews: Record<string, CachedTimesheetReview>;
  /** Timesheets whose last fetch failed */
  failed: Record<string, true>;
  /** Whether the timesheetReviewRequests endpoint exists (null until the first response) */
  requestsAvailable: boolean | null;
  /** The latest "look again" request per timesheet: an open one, or one that failed */
  requests: Record<string, BCTimesheetReviewRequest>;

  /**
   * Queue timesheets for a review fetch. Calls made in the same tick (e.g. every card
   * on the Approvals page mounting) are batched into one request. Fresh cache entries
   * and in-flight timesheets are skipped unless `force` is set.
   */
  requestReviews: (timeSheetNos: string[], options?: { force?: boolean }) => void;
  /**
   * Re-read the timesheets' open requests only. One that has finished is looked up to see how
   * it ended: Done fetches the fresh review, Failed stays to say why.
   */
  refreshRequests: (timeSheetNos: string[]) => Promise<void>;
  /** Ask the agent to look at a timesheet again now. Throws a message fit to show. */
  requestReview: (timeSheetNo: string, agentName: string) => Promise<void>;
  reset: () => void;
}

// Request batching and in-flight tracking live outside the store: they aren't render state
let queued = new Set<string>();
let flushScheduled = false;
let inFlight = new Set<string>();
// A review's notes never change (a new version gets a new review), so cache them by entry
let notesByEntry = new Map<number, BCTimesheetReviewLine[]>();
// Bumped on reset/company switch so late responses from before it are dropped
let generation = 0;

export const useTimesheetReviewStore = create<TimesheetReviewStore>((set, get) => {
  /**
   * Bring the timesheets' requests up to date. Returns the timesheets whose request has just
   * finished (Done), whose review is worth fetching again. Never throws: requests are an
   * extra, so a failure here leaves the reviews alone.
   */
  async function syncRequests(timeSheetNos: string[]): Promise<string[]> {
    if (get().requestsAvailable === false || timeSheetNos.length === 0) return [];
    const syncGeneration = generation;
    const isStale = () => syncGeneration !== generation;
    try {
      const open = await bcClient.getTimesheetReviewRequests(timeSheetNos);
      if (isStale()) return [];
      if (open === null) {
        set({ requestsAvailable: false, requests: {} });
        return [];
      }

      const openByNo = new Map<string, BCTimesheetReviewRequest>();
      for (const request of open) {
        const current = openByNo.get(request.timeSheetNo);
        if (!current || request.entryNo > current.entryNo)
          openByNo.set(request.timeSheetNo, request);
      }

      // Requests we were following that are no longer listed as open: how did they end?
      const followed = timeSheetNos
        .map((no) => get().requests[no])
        .filter((request): request is BCTimesheetReviewRequest => !!request)
        .filter(isOpenTimesheetReviewRequest)
        .filter((request) => openByNo.get(request.timeSheetNo)?.id !== request.id);
      const ended = await Promise.all(
        followed.map((request) =>
          bcClient
            .getTimesheetReviewRequest(request.id)
            .catch(() => ({ ...request, status: 'Done' as const }))
        )
      );
      if (isStale()) return [];

      const done: string[] = [];
      set((state) => {
        const requests = { ...state.requests };
        openByNo.forEach((request, no) => (requests[no] = request));
        for (const request of ended) {
          const no = request.timeSheetNo;
          if (openByNo.has(no) || state.requests[no]?.id !== request.id) continue;
          // Still open (made after the list was read): keep following it
          if (isOpenTimesheetReviewRequest(request)) requests[no] = request;
          // A failed request stays to say why; a done one gives way to its review
          else if (request.status === 'Failed') requests[no] = request;
          else {
            delete requests[no];
            done.push(no);
          }
        }
        return { requestsAvailable: true, requests };
      });
      return done;
    } catch (error) {
      if (!isStale()) console.warn('[Agent] Failed to fetch timesheet review requests:', error);
      return [];
    }
  }

  async function fetchBatch(timeSheetNos: string[]) {
    const batchGeneration = generation;
    const isStale = () => batchGeneration !== generation;
    timeSheetNos.forEach((no) => inFlight.add(no));
    // Requests alongside the reviews; one that finishes meanwhile gets its review re-read after
    const requestsSynced = syncRequests(timeSheetNos);
    try {
      const reviews = await bcClient.getTimesheetReviews(timeSheetNos);
      if (isStale()) return;
      if (reviews === null) {
        set({ available: false });
        return;
      }

      const latest = pickLatestReviews(reviews);
      const missingNotes = [
        ...new Set(Object.values(latest).map((review) => review.entryNo)),
      ].filter((entryNo) => !notesByEntry.has(entryNo));
      if (missingNotes.length > 0) {
        const notes = await bcClient.getTimesheetReviewLines(missingNotes);
        if (isStale()) return;
        // The extension is missing half the feature: treat reviews as unavailable
        if (notes === null) {
          set({ available: false });
          return;
        }
        for (const entryNo of missingNotes) {
          notesByEntry.set(
            entryNo,
            notes.filter((note) => note.reviewEntryNo === entryNo)
          );
        }
      }

      const fetchedAt = Date.now();
      set((state) => {
        const nextReviews = { ...state.reviews };
        const nextFailed = { ...state.failed };
        for (const no of timeSheetNos) {
          const review = latest[no] ?? null;
          nextReviews[no] = {
            review,
            notes: review ? (notesByEntry.get(review.entryNo) ?? []) : [],
            fetchedAt,
          };
          delete nextFailed[no];
        }
        // A concurrent batch may have found the endpoints missing: don't undo that
        return {
          available: state.available !== false,
          reviews: nextReviews,
          failed: nextFailed,
        };
      });
    } catch (error) {
      if (isStale()) return;
      console.warn('[Agent] Failed to fetch timesheet reviews:', error);
      // Keep any cached review on screen; only mark the failure
      set((state) => {
        const nextFailed = { ...state.failed };
        timeSheetNos.forEach((no) => (nextFailed[no] = true));
        return { failed: nextFailed };
      });
    } finally {
      if (!isStale()) timeSheetNos.forEach((no) => inFlight.delete(no));
    }
    const done = await requestsSynced;
    if (!isStale() && done.length > 0) get().requestReviews(done, { force: true });
  }

  function flush() {
    flushScheduled = false;
    const batch = [...queued];
    queued = new Set();
    if (get().available === false) return;
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      void fetchBatch(batch.slice(i, i + BATCH_SIZE));
    }
  }

  return {
    available: null,
    reviews: {},
    failed: {},
    requestsAvailable: null,
    requests: {},

    requestReviews: (timeSheetNos, options) => {
      const { reviews, available } = get();
      if (available === false) return;
      const now = Date.now();
      for (const no of timeSheetNos) {
        if (!no || inFlight.has(no)) continue;
        const cached = reviews[no];
        if (!options?.force && cached && now - cached.fetchedAt < REVIEW_REFRESH_INTERVAL_MS) {
          continue;
        }
        queued.add(no);
      }
      if (queued.size > 0 && !flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    },

    refreshRequests: async (timeSheetNos) => {
      const done = await syncRequests(timeSheetNos);
      if (done.length > 0) get().requestReviews(done, { force: true });
    },

    requestReview: async (timeSheetNo, agentName) => {
      const startedIn = generation;
      const isCurrent = () => generation === startedIn;
      try {
        const created = await bcClient.createTimesheetReviewRequest(timeSheetNo);
        // Made in the company it was asked in; the other company's view mustn't show it
        if (!isCurrent()) return;
        set((state) => ({ requests: { ...state.requests, [timeSheetNo]: created } }));
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : '';
        if (!/already (been requested|open)/i.test(message)) {
          throw new Error(
            /not allowed|permission/i.test(message)
              ? `You can't ask ${agentName} to review this timesheet.`
              : `Couldn't ask ${agentName} to look again. Please try again.`
          );
        }
        // Someone (maybe in another tab) already asked: follow their request instead
        const open = await bcClient.getTimesheetReviewRequests([timeSheetNo]).catch(() => null);
        if (!isCurrent()) return;
        const existing = open?.find(isOpenTimesheetReviewRequest);
        if (existing) {
          set((state) => ({ requests: { ...state.requests, [timeSheetNo]: existing } }));
          return;
        }
        throw new Error(`Couldn't ask ${agentName} to look again. Please try again.`);
      }
    },

    reset: () => {
      generation += 1;
      queued = new Set();
      inFlight = new Set();
      notesByEntry = new Map();
      set({ available: null, reviews: {}, failed: {}, requestsAvailable: null, requests: {} });
    },
  };
});

// Reviews belong to a company: drop them when the company changes
useCompanyStore.subscribe((state, prev) => {
  if (state.companyVersion !== prev.companyVersion) {
    useTimesheetReviewStore.getState().reset();
  }
});

// ============================================
// Polling: one timer for every visible timesheet
// ============================================

interface ReviewWatcher {
  timeSheetNo: string;
  /** Waiting on a first review or a re-review, so worth re-checking on the interval */
  awaiting: boolean;
  /** Has an open "look again" request, so worth following every few seconds */
  requestOpen: boolean;
}

const watchers = new Map<number, ReviewWatcher>();
let nextWatcherId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let requestPollTimer: ReturnType<typeof setInterval> | null = null;
// One requests refresh at a time, so a slow BC doesn't stack them up
let refreshingRequests = false;
let focusListening = false;
let lastFocusRefresh = 0;

function isPageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function watchedNos(filter?: (watcher: ReviewWatcher) => boolean) {
  const nos = new Set<string>();
  watchers.forEach((watcher) => {
    if (!filter || filter(watcher)) nos.add(watcher.timeSheetNo);
  });
  return [...nos];
}

function pollAwaiting() {
  if (isPageHidden()) return;
  const nos = watchedNos((watcher) => watcher.awaiting);
  if (nos.length > 0) useTimesheetReviewStore.getState().requestReviews(nos, { force: true });
}

function pollRequests() {
  if (isPageHidden() || refreshingRequests) return;
  const nos = watchedNos((watcher) => watcher.requestOpen);
  if (nos.length === 0) return;
  refreshingRequests = true;
  void useTimesheetReviewStore
    .getState()
    .refreshRequests(nos)
    .finally(() => (refreshingRequests = false));
}

function refreshOnFocus() {
  if (isPageHidden()) return;
  const now = Date.now();
  if (now - lastFocusRefresh < FOCUS_REFRESH_MIN_GAP_MS) return;
  lastFocusRefresh = now;
  const nos = watchedNos();
  if (nos.length > 0) useTimesheetReviewStore.getState().requestReviews(nos, { force: true });
}

function syncPolling() {
  const anyAwaiting = [...watchers.values()].some((watcher) => watcher.awaiting);
  if (anyAwaiting && !pollTimer) {
    pollTimer = setInterval(pollAwaiting, REVIEW_REFRESH_INTERVAL_MS);
  } else if (!anyAwaiting && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const anyRequestOpen = [...watchers.values()].some((watcher) => watcher.requestOpen);
  if (anyRequestOpen && !requestPollTimer) {
    requestPollTimer = setInterval(pollRequests, REVIEW_REQUEST_POLL_MS);
  } else if (!anyRequestOpen && requestPollTimer) {
    clearInterval(requestPollTimer);
    requestPollTimer = null;
  }

  if (typeof window === 'undefined') return;
  if (watchers.size > 0 && !focusListening) {
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    focusListening = true;
  } else if (watchers.size === 0 && focusListening) {
    window.removeEventListener('focus', refreshOnFocus);
    document.removeEventListener('visibilitychange', refreshOnFocus);
    focusListening = false;
  }
}

/**
 * Keep a visible timesheet's review fresh: re-checked on window focus, every
 * REVIEW_REFRESH_INTERVAL_MS while `awaiting`, and its request followed every
 * REVIEW_REQUEST_POLL_MS while `requestOpen`. Polling stops once nothing visible needs it.
 * Returns the unsubscribe function.
 */
export function watchTimesheetReview(
  timeSheetNo: string,
  awaiting: boolean,
  requestOpen = false
): () => void {
  const id = nextWatcherId++;
  watchers.set(id, { timeSheetNo, awaiting, requestOpen });
  syncPolling();
  return () => {
    watchers.delete(id);
    syncPolling();
  };
}
