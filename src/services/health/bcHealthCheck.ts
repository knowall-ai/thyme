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

// The headers Thyme's calls send that need the browser's permission (Accept is always
// allowed)
const REQUESTED_HEADERS = ['authorization', 'content-type'];

// The latest round of checks, shared: everyone asking while it runs, or for a minute
// after, gets its answer rather than starting another
let cached: { at: number; health: Promise<BcHealth> } | null = null;

/** One preflight: true if allowed as a browser needs, false if refused, null if no answer */
async function probe(origin: string): Promise<boolean | null> {
  try {
    const response = await fetch(PROBE_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': REQUESTED_HEADERS.join(','),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Allowed for Thyme's origin, with the headers its calls send: anything less and
    // the browser still blocks the call
    const allowOrigin = response.headers.get('access-control-allow-origin');
    const allowedHeaders = new Set(
      (response.headers.get('access-control-allow-headers') ?? '')
        .split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean)
    );
    return (
      response.ok &&
      (allowOrigin === origin || allowOrigin === '*') &&
      REQUESTED_HEADERS.every((header) => allowedHeaders.has(header))
    );
  } catch {
    return null;
  }
}

async function runChecks(origin: string): Promise<BcHealth> {
  const results = await Promise.all(Array.from({ length: PROBES }, () => probe(origin)));
  const passed = results.filter((r) => r === true).length;
  const answered = results.filter((r) => r !== null).length;
  return {
    status: getBcHealthStatus(passed, answered, PROBES),
    passed,
    total: PROBES,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Business Central's health, asked from `origin` (Thyme's public address). One round
 * of checks a minute at most, however many people ask (concurrent askers share it).
 */
export function checkBcHealth(origin: string): Promise<BcHealth> {
  if (!cached || Date.now() - cached.at >= CACHE_MS) {
    cached = { at: Date.now(), health: runChecks(origin) };
  }
  return cached.health;
}

/** For tests: forget the kept answer */
export function resetBcHealthCache() {
  cached = null;
}
