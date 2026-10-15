/**
 * Business Central API calls, relayed by Thyme's server.
 *
 * The browser calls `/api/bc/{tenant}/{environment}/api/…` on Thyme's own origin and
 * this forwards it, with the user's own bearer token, to the same path on Business
 * Central. Server-to-server calls need no CORS preflight, which Business Central's API
 * has been rejecting (401 on OPTIONS, for every origin), taking down every browser
 * call. Only Business Central's API host is ever called, and nothing is stored or
 * logged: the token is the signed-in user's, so they can do no more than they could
 * calling Business Central directly.
 */

import type { NextRequest } from 'next/server';

const UPSTREAM = (
  process.env.NEXT_PUBLIC_BC_BASE_URL || 'https://api.businesscentral.dynamics.com/v2.0'
).replace(/\/$/, '');

// Business Central's API host only: never anywhere a caller names
const UPSTREAM_ORIGIN = new URL(UPSTREAM).origin;
const PREFIX = '/api/bc';

// What a Business Central call needs, and nothing else (no cookies)
const REQUEST_HEADERS = [
  'authorization',
  'accept',
  'content-type',
  'if-match',
  'if-none-match',
  'prefer',
];
const RESPONSE_HEADERS = ['content-type', 'etag', 'odata-version', 'location', 'retry-after'];

async function relay(request: NextRequest): Promise<Response> {
  const { pathname, search } = request.nextUrl;
  if (!pathname.startsWith(`${PREFIX}/`)) {
    return new Response('Not a Business Central API path', { status: 400 });
  }
  const target = new URL(`${UPSTREAM}${pathname.slice(PREFIX.length)}${search}`);
  // A path can't climb out of the API (e.g. "/../"): URL resolves dot segments, so
  // check where it ended up
  if (
    target.origin !== UPSTREAM_ORIGIN ||
    !target.pathname.startsWith(new URL(UPSTREAM).pathname)
  ) {
    return new Response('Not a Business Central API path', { status: 400 });
  }

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers({ 'cache-control': 'no-store' });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // 204 and 304 can't have a body
  if (upstream.status === 204 || upstream.status === 304) {
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  }
  // BC's links to the next page (@odata.nextLink) and its other absolute URLs point at
  // its own API: point them back at the relay, or the browser would call BC directly
  if (upstream.headers.get('content-type')?.includes('json')) {
    const text = (await upstream.text()).replaceAll(UPSTREAM, PREFIX);
    return new Response(text, { status: upstream.status, headers: responseHeaders });
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const dynamic = 'force-dynamic';

export const GET = relay;
export const POST = relay;
export const PATCH = relay;
export const PUT = relay;
export const DELETE = relay;
