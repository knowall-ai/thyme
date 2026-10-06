import type { BCTimeSheet, BCTimeSheetLine } from '@/types';

// BC queues/throttles beyond a handful of concurrent OData requests per user
const DEFAULT_CONCURRENCY = 5;

/**
 * Fetch lines for each timesheet with a small worker pool, reporting each result as it lands.
 * Timesheets awaiting approval are fetched first so they don't queue behind the history.
 * Failures are skipped (the card falls back to the header) and results stop once cancelled.
 */
export async function prefetchTimeSheetLines(
  timeSheets: BCTimeSheet[],
  fetchLines: (timeSheetNo: string) => Promise<BCTimeSheetLine[]>,
  onLines: (timeSheetId: string, lines: BCTimeSheetLine[]) => void,
  isCancelled: () => boolean = () => false,
  concurrency = DEFAULT_CONCURRENCY
): Promise<void> {
  const isPending = (ts: BCTimeSheet) => ts.submittedExists && !ts.approvedExists;
  const queue = [...timeSheets.filter(isPending), ...timeSheets.filter((ts) => !isPending(ts))];

  const worker = async () => {
    while (queue.length > 0 && !isCancelled()) {
      const timeSheet = queue.shift()!;
      try {
        const lines = await fetchLines(timeSheet.number);
        if (!isCancelled()) onLines(timeSheet.id, lines);
      } catch {
        // Silently fail - will show fallback
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
