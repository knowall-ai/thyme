/**
 * Thyme's own check of whether Business Central is accepting browsers' calls (see
 * src/app/api/health/bc). Server-side only: it sends CORS preflights itself.
 */

import { getBcHealthStatus, type BcHealth } from '@/utils/bcHealth';

const UPSTREAM = (
  process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0'
).replace(/\/$/, '');
// Any API path will do: the preflight is answered before the path is looked at
const PROBE_URL = `${UPSTREAM}/production/api/v2.0/companies`;
// Business Central's failures have come and gone: several checks tell some from all
const PROBES = 3;
const TIMEOUT_MS = 5000;
const CACHE_MS = 60_000;

let cached: { at: number; health: BcHealth } | null = null;

/** One preflight: true if accepted, false if refused, null if no answer */
async function probe(origin: string): Promise<boolean | null> {
  try {
    const response = await fetch(PROBE_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,accept',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok && response.headers.has('access-control-allow-origin');
  } catch {
    return null;
  }
}

/**
 * Business Central's health, asked from `origin` (Thyme's public address). Kept for a
 * minute, so however many people ask, Business Central is asked rarely.
 */
export async function checkBcHealth(origin: string): Promise<BcHealth> {
  if (!cached || Date.now() - cached.at >= CACHE_MS) {
    const results = await Promise.all(Array.from({ length: PROBES }, () => probe(origin)));
    const passed = results.filter((r) => r === true).length;
    const answered = results.filter((r) => r !== null).length;
    cached = {
      at: Date.now(),
      health: {
        status: getBcHealthStatus(passed, answered, PROBES),
        passed,
        total: PROBES,
        checkedAt: new Date().toISOString(),
      },
    };
  }
  return cached.health;
}

/** For tests: forget the kept answer */
export function resetBcHealthCache() {
  cached = null;
}
