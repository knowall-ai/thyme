import { NextResponse, type NextRequest } from 'next/server';
import { parseCompanyPath } from '@/utils/companyPath';

/**
 * Per-request Content-Security-Policy with a nonce, per the Next.js CSP guide. Next.js
 * reads the nonce from the request's CSP header and stamps it on its own scripts, so
 * no script needs 'unsafe-inline'. Pages render dynamically for this (see app/layout.tsx).
 */

const DEFAULT_BC_BASE_URL = 'https://api.businesscentral.dynamics.com/v2.0';

function originOf(url: string | undefined, fallback: string): string {
  try {
    return new URL(url || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

const bcOrigin = originOf(process.env.NEXT_PUBLIC_BC_BASE_URL, DEFAULT_BC_BASE_URL);

// Everything the browser talks to directly: Entra ID sign-in, Microsoft Graph,
// Business Central and the public BTC price tickers.
const connectSources = [
  "'self'",
  'https://login.microsoftonline.com',
  'https://graph.microsoft.com',
  bcOrigin,
  'https://api.kraken.com',
  'https://api.coinbase.com',
  'https://www.bitstamp.net',
];

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // 'unsafe-inline' for styles only: react-hot-toast injects a <style> tag at runtime and
    // AsciiDoc output and React carry style attributes. Scripts stay nonce-only.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSources.join(' ')}`,
    // MSAL's silent token renewal uses a hidden iframe to Entra ID
    "frame-src 'self' https://login.microsoftonline.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

// First path segments whose deeper paths are real routes, not `/{environment}/{companyId}/…`
const NESTED_ROUTE_ROOTS = new Set(['api', 'projects', '_next']);

/**
 * True when the path would land on `/[environment]/[companyId]` with an unknown
 * environment or a non-GUID company. That layout calls notFound(), but the response
 * has already started streaming by then, so it would go out as a 200 (a soft 404).
 * Files (anything with an extension, e.g. /screenshots/*.png) are left alone.
 */
export function isInvalidCompanyPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2 || NESTED_ROUTE_ROOTS.has(segments[0])) return false;
  if (segments[segments.length - 1].includes('.')) return false;
  return parseCompanyPath(pathname) === null;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // `/_not-found` matches no route, so it renders the not-found page; the status makes it a real 404
  const response = isInvalidCompanyPath(request.nextUrl.pathname)
    ? NextResponse.rewrite(new URL('/_not-found', request.url), {
        status: 404,
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
