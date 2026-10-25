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
//
// Ask Timmie (the public helper) needs nothing more here: its API calls are same-origin
// ('self'), the server exchanges the WebRTC offer and answer with Azure OpenAI itself,
// and the call's media and data channel are WebRTC, which connect-src doesn't govern.
// Its reply audio plays from a MediaStream (srcObject), which media-src doesn't govern, and
// its greeting clips (/timmie/greetings/*.mp3) are same-origin, allowed by default-src 'self'.
const connectSources = [
  "'self'",
  'https://login.microsoftonline.com',
  'https://graph.microsoft.com',
  bcOrigin,
  'https://api.kraken.com',
  'https://api.coinbase.com',
  'https://www.bitstamp.net',
];

// Cloudflare Turnstile, Ask Timmie's optional bot check, renders in an iframe. Its script
// is added by our own (nonce-trusted) code, which 'strict-dynamic' already allows.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

export function buildCsp(
  nonce: string,
  isDev: boolean,
  options: { turnstile?: boolean } = {}
): string {
  const frameSources = ["'self'", 'https://login.microsoftonline.com'];
  if (options.turnstile) frameSources.push(TURNSTILE_ORIGIN);
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
    `frame-src ${frameSources.join(' ')}`,
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
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development', {
    // Both Turnstile keys set: Ask Timmie shows Cloudflare's check (services/public-timmie/config.ts)
    turnstile: !!(
      process.env.PUBLIC_TURNSTILE_SITE_KEY?.trim() && process.env.PUBLIC_TURNSTILE_SECRET?.trim()
    ),
  });

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
