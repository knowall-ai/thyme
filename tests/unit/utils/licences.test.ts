import { describe, it, expect } from 'vitest';
import {
  getLicenceSku,
  isAttachBaseSku,
  isFreeOrTrialSku,
  getEstimatedPrice,
  getLicenceCounts,
  getLicenceTag,
  getPeopleLicences,
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

describe('getPeopleLicences', () => {
  const people = getPeopleLicences(skus, users);
  const person = (id: string) => people.get(`${id}@contoso.com`)!;

  it('gives each person their highest Business Central licence and their Microsoft 365 plan', () => {
    expect(person('alex').businessCentral?.name).toBe('Business Central Essentials');
    expect(person('alex').microsoft365.map((s) => s.name)).toEqual(['Office 365 E3']);
    expect(person('jo').businessCentral?.name).toBe('Business Central Team Member');
    expect(person('lee').businessCentral).toBeNull();
  });

  it('leaves out free and trial licences', () => {
    expect(person('kim').microsoft365).toEqual([]);
    expect(person('kim').other).toEqual([]);
    expect(person('sam').other.map((s) => s.skuPartNumber)).not.toContain(
      'Dynamics_365_Sales_Premium_Viral_Trial'
    );
  });

  it('flags an attach without a paid base (a trial is no base), Dynamics Team Members in a BC-only org, and disabled accounts', () => {
    expect(person('sam').flags).toEqual(['attachWithoutBase']);
    expect(person('jo').flags).toEqual(['dynamicsTeamMembersInBcOnlyOrg']);
    expect(person('lee').flags).toEqual(['licensedButDisabled']);
    expect(person('alex').flags).toEqual([]);
  });

  it('flags an attach whose base subscription has lapsed (no seats enabled)', () => {
    const lapsed = getPeopleLicences(
      [...skus, sku('sales', 'DYN365_ENTERPRISE_SALES', 0, 1)],
      [user('sam', 'Sam Contoso', ['e3', 'att', 'sales'])]
    );
    expect(lapsed.get('sam@contoso.com')!.flags).toEqual(['attachWithoutBase']);
  });

  it("doesn't flag an attach or Dynamics Team Members when the org has a paid base app", () => {
    const withSales = getPeopleLicences(
      [...skus, sku('sales', 'DYN365_ENTERPRISE_SALES', 1, 1)],
      [user('sam', 'Sam Contoso', ['e3', 'att', 'sales']), user('jo', 'Jo Contoso', ['d365tm'])]
    );
    expect([...withSales.values()].every((p) => p.flags.length === 0)).toBe(true);
  });
});

describe('getLicenceCounts', () => {
  const counts = getLicenceCounts(skus);

  it('counts each paid licence, Business Central first, without free and trial ones', () => {
    expect(counts.map((c) => c.sku.name)).toEqual([
      'Business Central Essentials',
      'Business Central Essentials Attach',
      'Business Central Team Member',
      'Dynamics 365 Team Members',
      'Office 365 E3',
    ]);
    expect(counts[1]).toMatchObject({ assigned: 1, purchased: 4, unassigned: 3 });
  });

  it('prices each at the estimate in licencePrices.json, for everything purchased', () => {
    const attach = counts[1];
    expect(attach.monthlyPrice).toBe(getEstimatedPrice(attach.sku.skuPartNumber));
    expect(attach.monthlyCost).toBeCloseTo(4 * (attach.monthlyPrice ?? 0));
    expect(getEstimatedPrice('SOMETHING_ELSE')).toBeNull();
  });
});

describe('getLicenceTag', () => {
  const people = getPeopleLicences(skus, users);

  it('shows the Business Central licence, amber when something looks wrong', () => {
    expect(getLicenceTag(people.get('alex@contoso.com')!)).toMatchObject({
      label: 'BC Essentials',
      warn: false,
    });
    const sam = getLicenceTag(people.get('sam@contoso.com')!);
    expect(sam).toMatchObject({ label: 'BC Essentials Attach', warn: true });
    expect(sam.details).toContain('Microsoft 365: Office 365 E3');
    expect(sam.details.join('\n')).toContain('Essentials Attach without a qualifying base licence');
  });

  it('warns about a team member without a Business Central licence, or any licence', () => {
    expect(getLicenceTag(people.get('lee@contoso.com')!)).toMatchObject({
      label: 'No BC licence',
      warn: true,
    });
    expect(getLicenceTag(null)).toMatchObject({ label: 'No licence', warn: true });
  });
});
