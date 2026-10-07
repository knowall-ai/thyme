import type { BCEnvironmentType } from '@/types';
import { withResourceParam } from './teammateParam';

/**
 * Company-scoped URLs.
 *
 * Every in-app page lives under `/{environment}/{companyId}/…`, mirroring Business
 * Central's own `/{tenant}/{environment}/…` shape, so a link always opens the
 * company it was copied from:
 *
 *   /production/00000000-0000-0000-0000-000000000001/projects/PR00100
 *
 * Company identity is id + environment: a sandbox copy can share GUIDs with
 * Production, so both parts are always compared together.
 */

/** A company as far as URLs are concerned: its GUID and the environment it lives in. */
export interface CompanyRef {
  id: string;
  environment: BCEnvironmentType;
}

/** A company that may not have its environment set (e.g. a BCCompany). */
type MaybeCompany = { id: string; environment?: BCEnvironmentType };

/** Top-level sections that belong to a company (and so live under the company prefix). */
export const COMPANY_SCOPED_SECTIONS = [
  'time',
  'projects',
  'team',
  'plan',
  'approvals',
  'reports',
  'settings',
] as const;

/** Where a bare `/{environment}/{companyId}` URL lands. */
export const DEFAULT_COMPANY_PATH = '/time';

const KNOWN_ENVIRONMENTS: readonly BCEnvironmentType[] = ['sandbox', 'production'];

/** Environment display names */
export const ENVIRONMENT_LABELS: Record<BCEnvironmentType, string> = {
  sandbox: 'Sandbox',
  production: 'Production',
};

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value has the shape of a BC company GUID. */
export function isValidCompanyId(value: string | null | undefined): value is string {
  return !!value && GUID_PATTERN.test(value);
}

/**
 * Map a URL environment segment to the environment Thyme knows, ignoring case
 * (`Production` and `production` are the same). Returns null for anything else.
 */
export function parseEnvironment(value: string | null | undefined): BCEnvironmentType | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return KNOWN_ENVIRONMENTS.find((env) => env === lower) ?? null;
}

/** Same company: GUIDs compared case-insensitively, and the environment must match. */
export function isSameCompany(
  a: MaybeCompany | null | undefined,
  b: MaybeCompany | null | undefined
): boolean {
  if (!a || !b || !a.environment || !b.environment) return false;
  return a.id.toLowerCase() === b.id.toLowerCase() && a.environment === b.environment;
}

/** Prefix an app path with the company, e.g. `/projects` -> `/production/{id}/projects`. */
export function companyPath(company: CompanyRef, path: string = DEFAULT_COMPANY_PATH): string {
  const rest =
    !path || path === '/' ? DEFAULT_COMPANY_PATH : path.startsWith('/') ? path : `/${path}`;
  return `/${company.environment}/${company.id.toLowerCase()}${rest}`;
}

/**
 * Build an in-app href for the given company, or return the path unchanged when no
 * company is known yet - the unprefixed (legacy) URL then redirects to the
 * remembered company once one is available.
 */
export function companyHref(path: string, company: CompanyRef | null | undefined): string {
  return company ? companyPath(company, path) : path;
}

export interface ParsedCompanyPath {
  environment: BCEnvironmentType;
  companyId: string;
  /** The page path after the company prefix, always starting with `/`. */
  rest: string;
}

/** Split `/{environment}/{companyId}/rest` into its parts, or null if it isn't one. */
export function parseCompanyPath(pathname: string | null | undefined): ParsedCompanyPath | null {
  if (!pathname) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const environment = parseEnvironment(segments[0]);
  if (!environment || !isValidCompanyId(segments[1])) return null;
  return {
    environment,
    companyId: segments[1].toLowerCase(),
    rest: `/${segments.slice(2).join('/')}`,
  };
}

/** The page path without any company prefix (unchanged if there isn't one). */
export function stripCompanyPrefix(pathname: string): string {
  return parseCompanyPath(pathname)?.rest ?? pathname;
}

/** True for pre-company URLs such as `/projects/PR00100` that should be redirected. */
export function isLegacyCompanyPath(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0];
  return (COMPANY_SCOPED_SECTIONS as readonly string[]).includes(first ?? '');
}

/**
 * Where to go when switching company from the given page. List pages carry over
 * (with their query string, e.g. `?week=`, less `resource=`), but a detail page such as
 * `/projects/PR00100` goes to its list - the record won't exist in the other company.
 */
export function pathForCompanySwitch(rest: string, search: string = ''): string {
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) return DEFAULT_COMPANY_PATH;
  if (segments.length > 1) return `/${segments[0]}`;
  // Resource numbers are per company: the other company's could be someone else, or nobody
  return `/${segments[0]}${withResourceParam(search, null)}`;
}

/** Next.js page `searchParams`, resolved */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Rebuild a `?a=1&b=2` query string from page `searchParams` (empty string if none). */
export function toSearchString(searchParams: SearchParamsRecord | null | undefined): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

/**
 * Turn a legacy URL into the same page under the given company, keeping the query
 * string and hash: `/projects/PR00100?x=1#tasks` -> `/production/{id}/projects/PR00100?x=1#tasks`.
 */
export function legacyToCompanyUrl(
  company: CompanyRef,
  pathname: string,
  search: string = '',
  hash: string = ''
): string {
  return `${companyPath(company, pathname)}${search}${hash}`;
}

/**
 * Pick the company internal links should point at:
 * - the company in the URL, unless the user is known not to have it;
 * - otherwise the selected company, then the remembered (stored) selection;
 * - null when nothing is known yet (links stay unprefixed and redirect later).
 */
export function resolveLinkCompany({
  urlCompany,
  companies,
  companiesLoaded,
  failedEnvironments = [],
  selectedCompany,
  storedCompany,
}: {
  urlCompany: CompanyRef | null;
  companies: MaybeCompany[];
  companiesLoaded: boolean;
  failedEnvironments?: BCEnvironmentType[];
  selectedCompany: MaybeCompany | null;
  storedCompany: MaybeCompany | null;
}): CompanyRef | null {
  if (
    urlCompany &&
    (!companiesLoaded ||
      failedEnvironments.includes(urlCompany.environment) ||
      companies.some((c) => isSameCompany(c, urlCompany)))
  ) {
    return urlCompany;
  }
  for (const candidate of [selectedCompany, storedCompany]) {
    if (candidate?.environment && isValidCompanyId(candidate.id)) {
      return { id: candidate.id, environment: candidate.environment };
    }
  }
  return null;
}

export type CompanyRouteState<T extends MaybeCompany> =
  /** The URL's company is the active one: render the page */
  | { status: 'ready' }
  /** The user has the URL's company but another is active: switch to it first */
  | { status: 'switch'; company: T }
  /** The user's companies are loaded and the URL's company isn't one of them */
  | { status: 'no-access' }
  /** Waiting for the company list before we can tell */
  | { status: 'loading' }
  /** The URL's company (or its environment) failed to load and it isn't the active one */
  | { status: 'error' };

/**
 * Decide what a company URL should show. The page only renders once the URL's
 * company is the active one, so another company's data never appears under it.
 * When the URL already matches the remembered company the page renders straight
 * away, without waiting for the company list.
 */
export function getCompanyRouteState<T extends MaybeCompany>({
  urlCompany,
  activeCompany,
  companies,
  companiesLoaded,
  failedEnvironments = [],
  hasError,
}: {
  urlCompany: CompanyRef;
  activeCompany: MaybeCompany | null;
  companies: T[];
  companiesLoaded: boolean;
  /** Environments whose companies failed to load, so the list may be missing the URL's */
  failedEnvironments?: BCEnvironmentType[];
  hasError: boolean;
}): CompanyRouteState<T> {
  const isActive = isSameCompany(activeCompany, urlCompany);
  if (companiesLoaded) {
    const match = companies.find((c) => isSameCompany(c, urlCompany));
    if (match) return isActive ? { status: 'ready' } : { status: 'switch', company: match };
    // Not in the list because its environment didn't load: we can't say "no access".
    // Keep showing the remembered company; otherwise offer a retry
    if (failedEnvironments.includes(urlCompany.environment)) {
      return isActive ? { status: 'ready' } : { status: 'error' };
    }
    return { status: 'no-access' };
  }
  if (isActive) return { status: 'ready' };
  return hasError ? { status: 'error' } : { status: 'loading' };
}
