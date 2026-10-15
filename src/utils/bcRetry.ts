/**
 * When to retry a Business Central call. BC answers 504 "Request timed out", 502/503
 * while it's busy or recovering, and 429 when it throttles; the same query moments
 * later usually succeeds, so a read waits briefly and tries again rather than failing
 * the page. Writes aren't retried: one BC did apply could be applied twice.
 */

/** Statuses worth another try */
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
/** Retries after the first attempt */
export const BC_MAX_RETRIES = 2;
/** Waits before each retry, when BC doesn't say (ms) */
const BACKOFF_MS = [1000, 3000];
/** The longest wait, even if BC's Retry-After asks for more (ms) */
const MAX_WAIT_MS = 10_000;

/**
 * How long to wait before retrying, or null not to retry. `attempt` is the retry about
 * to be made (0 for the first).
 */
export function getBcRetryDelay(
  method: string | undefined,
  status: number,
  retryAfter: string | null,
  attempt: number
): number | null {
  const isRead = !method || ['GET', 'HEAD'].includes(method.toUpperCase());
  if (!isRead || !RETRY_STATUSES.has(status) || attempt >= BC_MAX_RETRIES) return null;
  const fallback = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  // Retry-After is seconds (or an HTTP date, which we don't bother with)
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : fallback;
  return Math.min(wait, MAX_WAIT_MS);
}
