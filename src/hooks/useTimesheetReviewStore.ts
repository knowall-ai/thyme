import { create } from 'zustand';
import type { BCTimesheetReview, BCTimesheetReviewLine } from '@/types';
import { bcClient } from '@/services/bc/bcClient';
import { pickLatestReviews } from '@/utils';
import { useCompanyStore } from './useCompanyStore';

// How often timesheets waiting on Poppie are re-checked (she reviews every ~10 minutes)
export const REVIEW_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
// Window focus refreshes are skipped if the last one was this recent
const FOCUS_REFRESH_MIN_GAP_MS = 30 * 1000;
// Timesheets per request, keeping the OR-filter URL well under BC's length limit
const BATCH_SIZE = 15;

export interface CachedTimesheetReview {
  /** The newest review, or null when Poppie hasn't reviewed the timesheet */
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

  /**
   * Queue timesheets for a review fetch. Calls made in the same tick (e.g. every card
   * on the Approvals page mounting) are batched into one request. Fresh cache entries
   * and in-flight timesheets are skipped unless `force` is set.
   */
  requestReviews: (timeSheetNos: string[], options?: { force?: boolean }) => void;
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
  async function fetchBatch(timeSheetNos: string[]) {
    const batchGeneration = generation;
    const isStale = () => batchGeneration !== generation;
    timeSheetNos.forEach((no) => inFlight.add(no));
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
      console.warn('[Poppie] Failed to fetch timesheet reviews:', error);
      // Keep any cached review on screen; only mark the failure
      set((state) => {
        const nextFailed = { ...state.failed };
        timeSheetNos.forEach((no) => (nextFailed[no] = true));
        return { failed: nextFailed };
      });
    } finally {
      if (!isStale()) timeSheetNos.forEach((no) => inFlight.delete(no));
    }
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

    reset: () => {
      generation += 1;
      queued = new Set();
      inFlight = new Set();
      notesByEntry = new Map();
      set({ available: null, reviews: {}, failed: {} });
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
}

const watchers = new Map<number, ReviewWatcher>();
let nextWatcherId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let focusListening = false;
let lastFocusRefresh = 0;

function isPageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function watchedNos(onlyAwaiting: boolean) {
  const nos = new Set<string>();
  watchers.forEach((watcher) => {
    if (!onlyAwaiting || watcher.awaiting) nos.add(watcher.timeSheetNo);
  });
  return [...nos];
}

function pollAwaiting() {
  if (isPageHidden()) return;
  const nos = watchedNos(true);
  if (nos.length > 0) useTimesheetReviewStore.getState().requestReviews(nos, { force: true });
}

function refreshOnFocus() {
  if (isPageHidden()) return;
  const now = Date.now();
  if (now - lastFocusRefresh < FOCUS_REFRESH_MIN_GAP_MS) return;
  lastFocusRefresh = now;
  const nos = watchedNos(false);
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
 * Keep a visible timesheet's review fresh: re-checked on window focus, and every
 * REVIEW_REFRESH_INTERVAL_MS while `awaiting`. Polling stops once nothing visible is
 * awaiting a review. Returns the unsubscribe function.
 */
export function watchTimesheetReview(timeSheetNo: string, awaiting: boolean): () => void {
  const id = nextWatcherId++;
  watchers.set(id, { timeSheetNo, awaiting });
  syncPolling();
  return () => {
    watchers.delete(id);
    syncPolling();
  };
}
