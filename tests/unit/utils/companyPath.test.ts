import { describe, it, expect } from 'vitest';
import {
  companyHref,
  companyPath,
  getCompanyRouteState,
  isLegacyCompanyPath,
  isSameCompany,
  isValidCompanyId,
  legacyToCompanyUrl,
  parseCompanyPath,
  parseEnvironment,
  pathForCompanySwitch,
  resolveLinkCompany,
  stripCompanyPrefix,
  toSearchString,
  type CompanyRef,
} from '@/utils/companyPath';

const ID_A = '00000000-0000-0000-0000-000000000001';
const ID_B = '00000000-0000-0000-0000-000000000002';
const PROD_A: CompanyRef = { id: ID_A, environment: 'production' };
const SANDBOX_A: CompanyRef = { id: ID_A, environment: 'sandbox' };
const PROD_B: CompanyRef = { id: ID_B, environment: 'production' };

describe('isValidCompanyId', () => {
  it('accepts GUIDs in either case', () => {
    expect(isValidCompanyId(ID_A)).toBe(true);
    expect(isValidCompanyId('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidCompanyId('')).toBe(false);
    expect(isValidCompanyId(null)).toBe(false);
    expect(isValidCompanyId('PR00100')).toBe(false);
    expect(isValidCompanyId(`${ID_A}x`)).toBe(false);
    expect(isValidCompanyId('00000000000000000000000000000001')).toBe(false);
  });
});

describe('parseEnvironment', () => {
  it('maps known environments ignoring case', () => {
    expect(parseEnvironment('production')).toBe('production');
    expect(parseEnvironment('Production')).toBe('production');
    expect(parseEnvironment('SANDBOX')).toBe('sandbox');
  });

  it('returns null for unknown environments', () => {
    expect(parseEnvironment('projects')).toBeNull();
    expect(parseEnvironment('')).toBeNull();
    expect(parseEnvironment(undefined)).toBeNull();
  });
});

describe('isSameCompany', () => {
  it('needs the same id and environment', () => {
    expect(isSameCompany(PROD_A, { id: ID_A.toUpperCase(), environment: 'production' })).toBe(true);
    // A sandbox copy can share its GUID with Production
    expect(isSameCompany(PROD_A, SANDBOX_A)).toBe(false);
    expect(isSameCompany(PROD_A, PROD_B)).toBe(false);
  });

  it('is false when either side is missing or has no environment', () => {
    expect(isSameCompany(PROD_A, null)).toBe(false);
    expect(isSameCompany({ id: ID_A }, { id: ID_A })).toBe(false);
  });
});

describe('companyPath', () => {
  it('prefixes the path with environment and company', () => {
    expect(companyPath(PROD_A, '/projects/PR00100')).toBe(`/production/${ID_A}/projects/PR00100`);
    expect(companyPath(SANDBOX_A, 'plan')).toBe(`/sandbox/${ID_A}/plan`);
  });

  it('defaults to the Time page', () => {
    expect(companyPath(PROD_A)).toBe(`/production/${ID_A}/time`);
    expect(companyPath(PROD_A, '/')).toBe(`/production/${ID_A}/time`);
  });

  it('lower-cases the company id', () => {
    expect(companyPath({ id: ID_A.toUpperCase(), environment: 'production' }, '/team')).toBe(
      `/production/${ID_A}/team`
    );
  });
});

describe('companyHref', () => {
  it('leaves the path alone when no company is known', () => {
    expect(companyHref('/projects', null)).toBe('/projects');
    expect(companyHref('/projects', PROD_B)).toBe(`/production/${ID_B}/projects`);
  });
});

describe('parseCompanyPath / stripCompanyPrefix', () => {
  it('splits a company URL', () => {
    expect(parseCompanyPath(`/Production/${ID_A}/projects/PR00100`)).toEqual({
      environment: 'production',
      companyId: ID_A,
      rest: '/projects/PR00100',
    });
    expect(parseCompanyPath(`/sandbox/${ID_A}`)?.rest).toBe('/');
  });

  it('returns null for non-company URLs', () => {
    expect(parseCompanyPath('/')).toBeNull();
    expect(parseCompanyPath('/projects/PR00100')).toBeNull();
    expect(parseCompanyPath('/production/not-a-guid/time')).toBeNull();
    expect(parseCompanyPath(null)).toBeNull();
  });

  it('strips only a valid prefix', () => {
    expect(stripCompanyPrefix(`/production/${ID_A}/plan`)).toBe('/plan');
    expect(stripCompanyPrefix('/plan')).toBe('/plan');
  });
});

describe('isLegacyCompanyPath', () => {
  it('recognises pre-company app URLs', () => {
    expect(isLegacyCompanyPath('/time')).toBe(true);
    expect(isLegacyCompanyPath('/projects/PR00100')).toBe(true);
    expect(isLegacyCompanyPath('/settings')).toBe(true);
  });

  it('ignores public and company URLs', () => {
    expect(isLegacyCompanyPath('/')).toBe(false);
    expect(isLegacyCompanyPath('/pricing')).toBe(false);
    expect(isLegacyCompanyPath(`/production/${ID_A}/time`)).toBe(false);
  });
});

describe('legacyToCompanyUrl', () => {
  it('keeps the path, query string and hash', () => {
    expect(legacyToCompanyUrl(PROD_A, '/projects/PR00100', '?tab=tasks', '#budget')).toBe(
      `/production/${ID_A}/projects/PR00100?tab=tasks#budget`
    );
    expect(legacyToCompanyUrl(SANDBOX_A, '/time', '?week=2026-10-05')).toBe(
      `/sandbox/${ID_A}/time?week=2026-10-05`
    );
  });
});

describe('pathForCompanySwitch', () => {
  it('keeps list pages and their query string', () => {
    expect(pathForCompanySwitch('/plan')).toBe('/plan');
    expect(pathForCompanySwitch('/time', '?week=2026-10-05')).toBe('/time?week=2026-10-05');
  });

  it('drops the teammate, as resource numbers are per company', () => {
    expect(pathForCompanySwitch('/time', '?week=2026-10-05&resource=R0070')).toBe(
      '/time?week=2026-10-05'
    );
    expect(pathForCompanySwitch('/time', '?resource=R0070')).toBe('/time');
  });

  it('sends detail pages to their list page', () => {
    expect(pathForCompanySwitch('/projects/PR00100', '?x=1')).toBe('/projects');
  });

  it('defaults to the Time page', () => {
    expect(pathForCompanySwitch('/')).toBe('/time');
  });
});

describe('resolveLinkCompany', () => {
  const base = {
    urlCompany: null,
    companies: [PROD_A, PROD_B],
    companiesLoaded: true,
    selectedCompany: null,
    storedCompany: null,
  };

  it('uses the URL company while the list is loading, or when the user has it', () => {
    expect(resolveLinkCompany({ ...base, urlCompany: PROD_B, selectedCompany: PROD_A })).toEqual(
      PROD_B
    );
    expect(
      resolveLinkCompany({
        ...base,
        urlCompany: SANDBOX_A,
        companiesLoaded: false,
        companies: [],
        selectedCompany: PROD_A,
      })
    ).toEqual(SANDBOX_A);
  });

  it('falls back to the selected company when the user lacks the URL company', () => {
    expect(resolveLinkCompany({ ...base, urlCompany: SANDBOX_A, selectedCompany: PROD_B })).toEqual(
      PROD_B
    );
  });

  it('falls back to the stored selection, then null', () => {
    expect(resolveLinkCompany({ ...base, storedCompany: PROD_A })).toEqual(PROD_A);
    expect(
      resolveLinkCompany({ ...base, storedCompany: { id: '', environment: 'production' } })
    ).toBeNull();
    expect(resolveLinkCompany(base)).toBeNull();
  });
});

describe('getCompanyRouteState', () => {
  const companies = [
    { ...PROD_A, name: 'Contoso' },
    { ...PROD_B, name: 'Contoso Sandbox Copy' },
  ];

  it('renders straight away when the URL is the remembered company', () => {
    expect(
      getCompanyRouteState({
        urlCompany: PROD_A,
        activeCompany: PROD_A,
        companies: [],
        companiesLoaded: false,
        hasError: false,
      })
    ).toEqual({ status: 'ready' });
  });

  it('waits for the company list before switching to another company', () => {
    expect(
      getCompanyRouteState({
        urlCompany: PROD_B,
        activeCompany: PROD_A,
        companies: [],
        companiesLoaded: false,
        hasError: false,
      })
    ).toEqual({ status: 'loading' });
  });

  it('switches to the URL company once the user is known to have it', () => {
    expect(
      getCompanyRouteState({
        urlCompany: PROD_B,
        activeCompany: PROD_A,
        companies,
        companiesLoaded: true,
        hasError: false,
      })
    ).toEqual({ status: 'switch', company: companies[1] });
  });

  it('reports no access for a company the user does not have, even if it was remembered', () => {
    expect(
      getCompanyRouteState({
        urlCompany: SANDBOX_A,
        activeCompany: PROD_A,
        companies,
        companiesLoaded: true,
        hasError: false,
      })
    ).toEqual({ status: 'no-access' });
    expect(
      getCompanyRouteState({
        urlCompany: SANDBOX_A,
        activeCompany: SANDBOX_A,
        companies,
        companiesLoaded: true,
        hasError: false,
      })
    ).toEqual({ status: 'no-access' });
  });

  it('reports an error when the list fails and the URL is not the active company', () => {
    expect(
      getCompanyRouteState({
        urlCompany: PROD_B,
        activeCompany: PROD_A,
        companies: [],
        companiesLoaded: false,
        hasError: true,
      })
    ).toEqual({ status: 'error' });
  });

  it("doesn't claim no access when the URL company's environment failed to load", () => {
    const partial = {
      urlCompany: SANDBOX_A,
      companies,
      companiesLoaded: true,
      failedEnvironments: ['sandbox' as const],
      hasError: false,
    };
    // Offer a retry rather than "no access"...
    expect(getCompanyRouteState({ ...partial, activeCompany: PROD_A })).toEqual({
      status: 'error',
    });
    // ...but keep showing the remembered company if that's the one in the URL
    expect(getCompanyRouteState({ ...partial, activeCompany: SANDBOX_A })).toEqual({
      status: 'ready',
    });
  });
});

describe('resolveLinkCompany with a partial company list', () => {
  it("keeps the URL company when its environment didn't load", () => {
    expect(
      resolveLinkCompany({
        urlCompany: SANDBOX_A,
        companies: [PROD_A],
        companiesLoaded: true,
        failedEnvironments: ['sandbox'],
        selectedCompany: PROD_A,
        storedCompany: null,
      })
    ).toEqual(SANDBOX_A);
  });
});

describe('toSearchString', () => {
  it('rebuilds the query string for the bare-company redirect', () => {
    expect(toSearchString({ week: '2026-10-05' })).toBe('?week=2026-10-05');
    expect(toSearchString({ tag: ['a', 'b'], skip: undefined })).toBe('?tag=a&tag=b');
    expect(toSearchString({})).toBe('');
    expect(toSearchString(undefined)).toBe('');
  });
});
