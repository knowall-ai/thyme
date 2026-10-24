import { describe, it, expect } from 'vitest';
import {
  KNOWALL_TENANT_ID,
  accessRequestMailto,
  getAccountTenantId,
  isTenantApproved,
  normaliseTenantId,
  parseApprovedTenantIds,
} from '@/utils/tenantAccess';

const CONTOSO = '11111111-2222-3333-4444-555555555555';
const FABRIKAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('normaliseTenantId', () => {
  it('lowercases and trims a GUID', () => {
    expect(normaliseTenantId(`  ${FABRIKAM.toUpperCase()} `)).toBe(FABRIKAM);
  });

  it('rejects anything that is not a GUID', () => {
    for (const value of [undefined, null, '', 'common', 'organizations', 42, `${CONTOSO}x`]) {
      expect(normaliseTenantId(value)).toBeNull();
    }
  });
});

describe('parseApprovedTenantIds', () => {
  it('reads comma-separated GUIDs, lowercased, ignoring blanks and junk', () => {
    expect(parseApprovedTenantIds(` ${CONTOSO.toUpperCase()}, ,not-a-guid,${FABRIKAM} `)).toEqual([
      CONTOSO,
      FABRIKAM,
    ]);
  });

  it('is empty when unset', () => {
    expect(parseApprovedTenantIds(undefined)).toEqual([]);
    expect(parseApprovedTenantIds('')).toEqual([]);
  });
});

describe('isTenantApproved', () => {
  it('always approves the KnowAll tenant (members and B2B guests sign in through it)', () => {
    expect(isTenantApproved(KNOWALL_TENANT_ID, [])).toBe(true);
    expect(isTenantApproved(KNOWALL_TENANT_ID.toUpperCase(), [])).toBe(true);
  });

  it('approves a tenant listed in APPROVED_TENANT_IDS, whatever its case', () => {
    const approved = parseApprovedTenantIds(CONTOSO);
    expect(isTenantApproved(CONTOSO.toUpperCase(), approved)).toBe(true);
  });

  it('does not approve any other tenant', () => {
    expect(isTenantApproved(FABRIKAM, parseApprovedTenantIds(CONTOSO))).toBe(false);
  });

  it('never approves a missing or invalid tid, and never falls back to a default tenant', () => {
    for (const tid of [undefined, null, '', 'common', 'not-a-guid']) {
      expect(isTenantApproved(tid, [KNOWALL_TENANT_ID, CONTOSO])).toBe(false);
    }
  });
});

describe('getAccountTenantId', () => {
  it("reads the ID token's tid claim", () => {
    expect(getAccountTenantId({ idTokenClaims: { tid: CONTOSO.toUpperCase() } })).toBe(CONTOSO);
  });

  it('is null without the claim or account', () => {
    expect(getAccountTenantId({ idTokenClaims: {} })).toBeNull();
    expect(getAccountTenantId({})).toBeNull();
    expect(getAccountTenantId(null)).toBeNull();
  });
});

describe('accessRequestMailto', () => {
  it('addresses hello@knowall.ai with the app, organisation, tenant and email', () => {
    const href = accessRequestMailto({
      app: 'Thyme',
      organisationName: 'Contoso Ltd',
      tenantId: CONTOSO,
      email: 'alex@contoso.com',
    });
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('hello@knowall.ai');
    expect(url.searchParams.get('subject')).toBe('Thyme access request');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('App: Thyme');
    expect(body).toContain('Organisation: Contoso Ltd');
    expect(body).toContain(`Tenant ID: ${CONTOSO}`);
    expect(body).toContain('Email: alex@contoso.com');
  });

  it('says Unknown for anything not known', () => {
    const body = new URL(
      accessRequestMailto({ app: 'Thyme', organisationName: null, tenantId: null, email: null })
    ).searchParams.get('body')!;
    expect(body).toContain('Organisation: Unknown');
    expect(body).toContain('Tenant ID: Unknown');
  });
});
