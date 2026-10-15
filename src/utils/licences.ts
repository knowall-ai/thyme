/**
 * Licences: who holds which Business Central and Microsoft 365 licence, what they
 * cost, and what looks wrong. Pure functions over Microsoft Graph's subscribedSkus
 * and users' assignedLicenses, so they can be tested without Graph.
 */

/** What a licence is for, which decides where it shows */
export type LicenceCategory = 'businessCentral' | 'dynamics' | 'microsoft365' | 'other';

export interface LicenceSku {
  skuPartNumber: string;
  name: string;
  category: LicenceCategory;
  /**
   * Estimated monthly list price per licence, GBP ex VAT on an annual term (UK list
   * prices as reported in 2025-2026; Microsoft's own price list, a partner's and any
   * discount will differ). Undefined when there's no estimate. Admins can override.
   */
  monthlyPrice?: number;
  /** Business Central licences by rank: the highest is a person's BC licence */
  bcRank?: number;
}

// Microsoft's SKU part numbers for the licences Thyme knows; others show their part number
const CATALOGUE: LicenceSku[] = [
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_PREMIUM',
    name: 'Business Central Premium',
    category: 'businessCentral',
    monthlyPrice: 82.2,
    bcRank: 4,
  },
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_ESSENTIAL',
    name: 'Business Central Essentials',
    category: 'businessCentral',
    monthlyPrice: 57.5,
    bcRank: 3,
  },
  {
    skuPartNumber: 'Dynamics_365_Business_Central_Essentials_Attach',
    name: 'Business Central Essentials Attach',
    category: 'businessCentral',
    monthlyPrice: 16.4,
    bcRank: 2,
  },
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_TEAM_MEMBER',
    name: 'Business Central Team Member',
    category: 'businessCentral',
    monthlyPrice: 6.6,
    bcRank: 1,
  },
  {
    skuPartNumber: 'DYN365_TEAM_MEMBERS',
    name: 'Dynamics 365 Team Members',
    category: 'dynamics',
    monthlyPrice: 6.6,
  },
  {
    skuPartNumber: 'O365_BUSINESS_ESSENTIALS',
    name: 'Microsoft 365 Business Basic',
    category: 'microsoft365',
    monthlyPrice: 5.75,
  },
  {
    skuPartNumber: 'O365_BUSINESS_PREMIUM',
    name: 'Microsoft 365 Business Standard',
    category: 'microsoft365',
    monthlyPrice: 11.55,
  },
  {
    skuPartNumber: 'SPB',
    name: 'Microsoft 365 Business Premium',
    category: 'microsoft365',
    monthlyPrice: 18.1,
  },
  { skuPartNumber: 'STANDARDPACK', name: 'Office 365 E1', category: 'microsoft365' },
  {
    skuPartNumber: 'ENTERPRISEPACK',
    name: 'Office 365 E3',
    category: 'microsoft365',
    monthlyPrice: 23.3,
  },
  {
    skuPartNumber: 'ENTERPRISEPREMIUM',
    name: 'Office 365 E5',
    category: 'microsoft365',
    monthlyPrice: 36.8,
  },
  {
    skuPartNumber: 'SPE_E3',
    name: 'Microsoft 365 E3',
    category: 'microsoft365',
    monthlyPrice: 33.5,
  },
  {
    skuPartNumber: 'SPE_E5',
    name: 'Microsoft 365 E5',
    category: 'microsoft365',
    monthlyPrice: 51.6,
  },
];
const CATALOGUE_BY_PART = new Map(CATALOGUE.map((sku) => [sku.skuPartNumber.toUpperCase(), sku]));

/** The licence a SKU part number is, or a plain entry for one Thyme doesn't know */
export function getLicenceSku(skuPartNumber: string): LicenceSku {
  const known = CATALOGUE_BY_PART.get(skuPartNumber.toUpperCase());
  if (known) return known;
  // Unknown Business Central and Dynamics SKUs still group with their family
  const part = skuPartNumber.toUpperCase();
  const category: LicenceCategory = part.includes('BUSCENTRAL')
    ? 'businessCentral'
    : part.startsWith('DYN365') || part.startsWith('D365')
      ? 'dynamics'
      : 'other';
  return { skuPartNumber, name: skuPartNumber, category };
}

/**
 * Free and trial SKUs (viral sign-ups, developer and exploratory plans): hidden by
 * default, as nobody pays for them
 */
export function isFreeOrTrialSku(skuPartNumber: string): boolean {
  // Information-worker (_IW) and preview plans are free trials too, e.g. Business
  // Central's PROJECT_MADEIRA_PREVIEW_IW_SKU; Power BI's free plan is POWER_BI_STANDARD
  return /FREE|TRIAL|VIRAL|EXPLORATORY|DEVELOPER|ADHOC|PRIVPREV|PREVIEW|VIRTUALUSER|_IW($|_)|_DEV$|^POWER_BI_STANDARD$|^STREAM$|^WINDOWS_STORE$/i.test(
    skuPartNumber
  );
}

/**
 * Dynamics 365 apps an Essentials Attach licence needs as its base: Sales, Customer
 * Service or Field Service (Enterprise or Premium). Attach and Team Members SKUs aren't.
 */
export function isAttachBaseSku(skuPartNumber: string): boolean {
  const part = skuPartNumber.toUpperCase();
  // A trial (e.g. a viral Sales trial) is no base: the attach still isn't licensed
  if (part.includes('ATTACH') || part.includes('TEAM_MEMBER') || isFreeOrTrialSku(part)) {
    return false;
  }
  return /^(DYN365|D365|DYNAMICS_365)_.*(SALES|CUSTOMER_SERVICE|CUSTOMERSERVICE|FIELD_SERVICE|FIELDSERVICE)/.test(
    part
  );
}

const isEssentialsAttach = (part: string) =>
  /BUSINESS_CENTRAL.*ATTACH|BUSCENTRAL.*ATTACH/i.test(part);

/** A tenant's SKU, from Graph's subscribedSkus */
export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  /** Assigned */
  consumedUnits: number;
  /** Purchased (enabled) */
  prepaidUnits: { enabled: number };
}

/** A user, from Graph's users with assignedLicenses */
export interface LicensedUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  accountEnabled: boolean;
  assignedLicenses: { skuId: string }[];
}

export type LicenceFlag =
  | 'attachWithoutBase'
  | 'dynamicsTeamMembersInBcOnlyOrg'
  | 'licensedButDisabled';

export const LICENCE_FLAG_LABELS: Record<LicenceFlag, string> = {
  attachWithoutBase:
    'Essentials Attach without a qualifying base licence (Dynamics 365 Sales, Customer Service or Field Service)',
  dynamicsTeamMembersInBcOnlyOrg:
    'Dynamics 365 Team Members in a Business Central-only organisation (Business Central Team Member is the BC licence)',
  licensedButDisabled: 'Licences assigned to a disabled account',
};

export interface PersonLicences {
  user: LicensedUser;
  /** Their Business Central licence: the highest they hold, if any */
  businessCentral: LicenceSku | null;
  /** Every licence they hold that's shown (trials only when asked for), by category */
  microsoft365: LicenceSku[];
  dynamics: LicenceSku[];
  other: LicenceSku[];
  flags: LicenceFlag[];
}

export interface LicenceTotal {
  sku: LicenceSku;
  skuId: string;
  assigned: number;
  purchased: number;
  /** Purchased but not assigned */
  unassigned: number;
  /** Monthly cost of what's purchased, at the given price; null without a price */
  monthlyCost: number | null;
  /** The price used: an admin's override, else the estimate */
  monthlyPrice: number | null;
  freeOrTrial: boolean;
}

export interface LicenceSummary {
  people: PersonLicences[];
  totals: LicenceTotal[];
  /** Every purchased licence's monthly cost (those with a price) */
  monthlyTotal: number;
  /** Whether the organisation has a Dynamics 365 app an Attach licence could attach to */
  hasAttachBase: boolean;
}

/**
 * Who holds what, the totals per licence and their monthly cost, and the flags.
 * `prices` are admins' overrides by SKU part number; `includeTrials` shows free and
 * trial SKUs too.
 */
export function summariseLicences(
  skus: readonly SubscribedSku[],
  users: readonly LicensedUser[],
  prices: Readonly<Record<string, number>> = {},
  includeTrials = false
): LicenceSummary {
  const skuById = new Map(skus.map((sku) => [sku.skuId, sku]));
  const shown = (part: string) => includeTrials || !isFreeOrTrialSku(part);
  // A Dynamics 365 app the org has bought: what Essentials Attach needs, and what makes
  // Dynamics 365 Team Members a sensible licence
  const hasAttachBase = skus.some(
    (s) => isAttachBaseSku(s.skuPartNumber) && s.prepaidUnits.enabled > 0
  );
  const priceOf = (sku: LicenceSku) => prices[sku.skuPartNumber] ?? sku.monthlyPrice ?? null;

  const people: PersonLicences[] = [];
  for (const user of users) {
    const held = user.assignedLicenses
      .map((l) => skuById.get(l.skuId))
      .filter((s): s is SubscribedSku => !!s);
    const visible = held
      .filter((s) => shown(s.skuPartNumber))
      .map((s) => getLicenceSku(s.skuPartNumber));
    if (visible.length === 0) continue;

    const bc = visible
      .filter((s) => s.category === 'businessCentral')
      .sort((a, b) => (b.bcRank ?? 0) - (a.bcRank ?? 0));
    const parts = held.map((s) => s.skuPartNumber);
    const flags: LicenceFlag[] = [];
    if (parts.some(isEssentialsAttach) && !parts.some(isAttachBaseSku))
      flags.push('attachWithoutBase');
    if (parts.some((p) => p.toUpperCase() === 'DYN365_TEAM_MEMBERS') && !hasAttachBase) {
      flags.push('dynamicsTeamMembersInBcOnlyOrg');
    }
    const paid = held.some((s) => !isFreeOrTrialSku(s.skuPartNumber));
    if (!user.accountEnabled && paid) flags.push('licensedButDisabled');

    people.push({
      user,
      businessCentral: bc[0] ?? null,
      microsoft365: visible.filter((s) => s.category === 'microsoft365'),
      dynamics: visible.filter((s) => s.category === 'dynamics'),
      other: visible.filter((s) => s.category === 'other'),
      flags,
    });
  }
  people.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));

  const categoryOrder: LicenceCategory[] = ['businessCentral', 'dynamics', 'microsoft365', 'other'];
  const totals: LicenceTotal[] = skus
    .filter((s) => shown(s.skuPartNumber) && (s.prepaidUnits.enabled > 0 || s.consumedUnits > 0))
    .map((s) => {
      const sku = getLicenceSku(s.skuPartNumber);
      const price = priceOf(sku);
      const purchased = s.prepaidUnits.enabled;
      return {
        sku,
        skuId: s.skuId,
        assigned: s.consumedUnits,
        purchased,
        unassigned: Math.max(0, purchased - s.consumedUnits),
        monthlyPrice: price,
        monthlyCost: price === null ? null : price * purchased,
        freeOrTrial: isFreeOrTrialSku(s.skuPartNumber),
      };
    })
    .sort(
      (a, b) =>
        categoryOrder.indexOf(a.sku.category) - categoryOrder.indexOf(b.sku.category) ||
        (b.sku.bcRank ?? 0) - (a.sku.bcRank ?? 0) ||
        a.sku.name.localeCompare(b.sku.name)
    );

  return {
    people,
    totals,
    monthlyTotal: totals.reduce((sum, t) => sum + (t.monthlyCost ?? 0), 0),
    hasAttachBase,
  };
}

/**
 * Microsoft Entra roles that may see licences: Global Administrator, Global Reader,
 * License Administrator, User Administrator, Billing Administrator and Dynamics 365
 * Administrator (role template IDs, the same in every tenant)
 */
export const LICENCE_ADMIN_ROLE_TEMPLATE_IDS = new Set([
  '62e90394-69f5-4237-9190-012177145e10',
  'f2ef992c-3afb-46b9-b7cf-a126ee74c451',
  '4d6ac14f-3453-41d0-bef9-a3e0c569773a',
  'fe930be7-5e62-47db-91af-98c3a49a38b1',
  'b0f54661-2d74-4c50-afa3-1ec803f12efe',
  '44367163-eba1-44c3-98af-f5787879f96a',
]);
