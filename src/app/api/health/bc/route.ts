/**
 * Is Business Central accepting browsers' calls? Thyme's server asks it the way a
 * browser does before every API call: a CORS preflight (OPTIONS) from Thyme's origin.
 * Business Central has rejected these (401, for every origin) during outages, which
 * blocks every browser call while server-to-server calls still work.
 *
 * Unauthenticated and without secrets: it reports only the status, kept for a minute.
 */

import type { NextRequest } from 'next/server';
import { checkBcHealth } from '@/services/health/bcHealthCheck';

export async function GET(request: NextRequest): Promise<Response> {
  // Thyme's public address (behind Azure the request's own origin can be internal)
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  return Response.json(await checkBcHealth(origin), { headers: { 'cache-control': 'no-store' } });
}

export const dynamic = 'force-dynamic';
