import { describe, it, expect } from 'vitest';
import {
  getLicenceSku,
  isAttachBaseSku,
  isFreeOrTrialSku,
  summariseLicences,
  type LicensedUser,
  type SubscribedSku,
} from '@/utils/licences';

const sku = (
  skuId: string,
  skuPartNumber: string,
  purchased: number,
  assigned: number
): SubscribedSku => ({
  skuId,
  skuPartNumber,
  consumedUnits: assigned,
  prepaidUnits: { enabled: purchased },
});

// A Contoso tenant: Business Central only (no Dynamics 365 Sales or Customer Service,
// just viral trials of them), Office 365 E3, and free plans
const skus = [
  sku('e3', 'ENTERPRISEPACK', 6, 5),
  sku('bce', 'DYN365_BUSCENTRAL_ESSENTIAL', 1, 1),
  sku('bctm', 'DYN365_BUSCENTRAL_TEAM_MEMBER', 2, 1),
  sku('att', 'Dynamics_365_Business_Central_Essentials_Attach', 4, 1),
  sku('d365tm', 'DYN365_TEAM_MEMBERS', 3, 1),
  sku('salestrial', 'Dynamics_365_Sales_Premium_Viral_Trial', 10000, 1),
  sku('flow', 'FLOW_FREE', 10000, 3),
];

const user = (
  id: string,
  displayName: string,
  skuIds: string[],
  accountEnabled = true
): LicensedUser => ({
  id,
  displayName,
  userPrincipalName: `${id}@contoso.com`,
  accountEnabled,
  assignedLicenses: skuIds.map((skuId) => ({ skuId })),
});

const users = [
  user('alex', 'Alex Contoso', ['e3', 'bce', 'flow']),
  user('sam', 'Sam Contoso', ['e3', 'att', 'salestrial']),
  user('jo', 'Jo Contoso', ['e3', 'bctm', 'd365tm']),
  user('lee', 'Lee Contoso', ['e3'], false),
  user('kim', 'Kim Contoso', ['flow']),
];

describe('licence catalogue', () => {
  it('names the licences Thyme knows, and groups unknown Business Central ones with them', () => {
    expect(getLicenceSku('DYN365_BUSCENTRAL_ESSENTIAL').name).toBe('Business Central Essentials');
    expect(getLicenceSku('ENTERPRISEPACK').name).toBe('Office 365 E3');
    expect(getLicenceSku('DYN365_BUSCENTRAL_DEVICE').category).toBe('businessCentral');
    expect(getLicenceSku('SOMETHING_ELSE')).toMatchObject({
      name: 'SOMETHING_ELSE',
      category: 'other',
    });
  });

  it('knows free and trial plans, including viral, information-worker and preview ones', () => {
    for (const part of [
      'FLOW_FREE',
      'POWER_BI_STANDARD',
      'Dynamics_365_Sales_Premium_Viral_Trial',
      'DYN365_ENTERPRISE_P1_IW',
      'PROJECT_MADEIRA_PREVIEW_IW_SKU',
      'POWERAPPS_DEV',
      'CCIBOTS_PRIVPREV_VIRAL',
    ]) {
      expect(isFreeOrTrialSku(part)).toBe(true);
    }
    for (const part of ['ENTERPRISEPACK', 'DYN365_BUSCENTRAL_ESSENTIAL', 'SPB']) {
      expect(isFreeOrTrialSku(part)).toBe(false);
    }
  });

  it('counts paid Sales, Customer Service and Field Service as an attach base, not trials', () => {
    expect(isAttachBaseSku('DYN365_ENTERPRISE_SALES')).toBe(true);
    expect(isAttachBaseSku('DYN365_ENTERPRISE_CUSTOMER_SERVICE')).toBe(true);
    expect(isAttachBaseSku('Dynamics_365_Customer_Service_Enterprise_viral_trial')).toBe(false);
    expect(isAttachBaseSku('DYN365_TEAM_MEMBERS')).toBe(false);
  });
});

describe('summariseLicences', () => {
  const summary = summariseLicences(skus, users);
  const person = (name: string) => summary.people.find((p) => p.user.displayName === name)!;

  it('gives each person their highest Business Central licence and their Microsoft 365 plan', () => {
    expect(person('Alex Contoso').businessCentral?.name).toBe('Business Central Essentials');
    expect(person('Alex Contoso').microsoft365.map((s) => s.name)).toEqual(['Office 365 E3']);
    expect(person('Jo Contoso').businessCentral?.name).toBe('Business Central Team Member');
    expect(person('Lee Contoso').businessCentral).toBeNull();
  });

  it('hides free and trial licences, and people with only those, unless asked', () => {
    expect(summary.people.map((p) => p.user.displayName)).not.toContain('Kim Contoso');
    expect(summary.totals.map((t) => t.sku.skuPartNumber)).not.toContain('FLOW_FREE');
    const withTrials = summariseLicences(skus, users, {}, true);
    expect(withTrials.people.map((p) => p.user.displayName)).toContain('Kim Contoso');
  });

  it('flags an attach without a paid base (a trial is no base), Dynamics Team Members in a BC-only org, and disabled accounts', () => {
    expect(summary.hasAttachBase).toBe(false);
    expect(person('Sam Contoso').flags).toEqual(['attachWithoutBase']);
    expect(person('Jo Contoso').flags).toEqual(['dynamicsTeamMembersInBcOnlyOrg']);
    expect(person('Lee Contoso').flags).toEqual(['licensedButDisabled']);
    expect(person('Alex Contoso').flags).toEqual([]);
  });

  it("doesn't flag an attach or Dynamics Team Members when the org has a paid base app", () => {
    const withSales = summariseLicences(
      [...skus, sku('sales', 'DYN365_ENTERPRISE_SALES', 1, 1)],
      [user('sam', 'Sam Contoso', ['e3', 'att', 'sales']), user('jo', 'Jo Contoso', ['d365tm'])]
    );
    expect(withSales.people.every((p) => p.flags.length === 0)).toBe(true);
  });

  it('totals each licence: assigned, purchased, unassigned, and the monthly cost of what is purchased', () => {
    const attach = summary.totals.find((t) => t.sku.skuPartNumber.includes('Attach'))!;
    expect(attach).toMatchObject({ assigned: 1, purchased: 4, unassigned: 3, monthlyPrice: 16.4 });
    expect(attach.monthlyCost).toBeCloseTo(65.6);
    // Business Central first, Essentials above Team Member
    expect(summary.totals[0].sku.name).toBe('Business Central Essentials');
  });

  it("uses an admin's own price over the estimate, and totals the month", () => {
    const own = summariseLicences(skus, users, { ENTERPRISEPACK: 20 });
    expect(own.totals.find((t) => t.sku.skuPartNumber === 'ENTERPRISEPACK')!.monthlyCost).toBe(120);
    expect(own.monthlyTotal).toBeCloseTo(120 + 57.5 + 2 * 6.6 + 4 * 16.4 + 3 * 6.6);
  });
});
