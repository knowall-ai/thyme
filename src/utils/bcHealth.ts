/**
 * Whether Business Central is accepting browsers' calls, as Timmie's server finds it
 * (see src/app/api/health/bc). Microsoft has no public status page for Business
 * Central, and its service health needs an admin, so Timmie checks for itself.
 */

/**
 * - ok: every check passed
 * - degraded: some passed (Business Central rejecting browsers' calls now and then)
 * - down: none passed (every browser call is blocked)
 * - unreachable: Business Central didn't answer at all
 */
export type BcHealthStatus = 'ok' | 'degraded' | 'down' | 'unreachable';

export interface BcHealth {
  status: BcHealthStatus;
  /** Checks that passed, of `total` */
  passed: number;
  total: number;
  /** ISO time of the check */
  checkedAt: string;
}

/** Raised on window when a Business Central call never got a response (network or CORS) */
export const BC_UNREACHABLE_EVENT = 'timmie:bc-unreachable';

/** The status from how many checks passed, and how many got any answer */
export function getBcHealthStatus(passed: number, answered: number, total: number): BcHealthStatus {
  if (answered === 0) return 'unreachable';
  if (passed === total) return 'ok';
  return passed === 0 ? 'down' : 'degraded';
}

/** What to tell the user, or null when all is well */
export function describeBcHealth(status: BcHealthStatus): string | null {
  switch (status) {
    case 'ok':
      return null;
    case 'degraded':
      return 'Business Central is rejecting some requests from browsers right now, so parts of Timmie may not load. This is a Microsoft issue, not Timmie; refreshing may help.';
    case 'down':
      return "Business Central isn't accepting requests from browsers right now, so Timmie can't load your data. This is a Microsoft issue, not Timmie; it will clear once Microsoft fixes it.";
    case 'unreachable':
      return "Business Central isn't responding right now, so Timmie can't load your data. This is a Microsoft issue, not Timmie.";
  }
}
