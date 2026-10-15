/**
 * Licences: who holds which Business Central and Microsoft 365 licence, and what
 * looks wrong. Pure functions over Microsoft Graph's subscribedSkus
 * and users' assignedLicenses, so they can be tested without Graph.
 */

import licencePrices from '@/config/licencePrices.json';

/** The estimated prices' currency, basis and when they were checked (see the JSON) */
export const LICENCE_PRICES = {
  currency: licencePrices.currency,
  basis: licencePrices.basis,
  checked: licencePrices.checked,
};
const PRICES: Record<string, number> = licencePrices.prices;

/** A licence's estimated price a month, or null when src/config/licencePrices.json has none */
export function getEstimatedPrice(skuPartNumber: string): number | null {
  return PRICES[skuPartNumber] ?? null;
}

/** What a licence is for, which decides where it shows */
export type LicenceCategory = 'businessCentral' | 'dynamics' | 'microsoft365' | 'other';

export interface LicenceSku {
  skuPartNumber: string;
  name: string;
  category: LicenceCategory;
  /** Short name for a tag, e.g. "BC Essentials" */
  shortName?: string;
  /** Business Central licences by rank: the highest is a person's BC licence */
  bcRank?: number;
}

// Microsoft's SKU part numbers for the licences Thyme knows; others show their part number
const CATALOGUE: LicenceSku[] = [
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_PREMIUM',
    shortName: 'BC Premium',
    name: 'Business Central Premium',
    category: 'businessCentral',
    bcRank: 4,
  },
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_ESSENTIAL',
    shortName: 'BC Essentials',
    name: 'Business Central Essentials',
    category: 'businessCentral',
    bcRank: 3,
  },
  {
    skuPartNumber: 'Dynamics_365_Business_Central_Essentials_Attach',
    shortName: 'BC Essentials Attach',
    name: 'Business Central Essentials Attach',
    category: 'businessCentral',
    bcRank: 2,
  },
  {
    skuPartNumber: 'DYN365_BUSCENTRAL_TEAM_MEMBER',
    shortName: 'BC Team Member',
    name: 'Business Central Team Member',
    category: 'businessCentral',
    bcRank: 1,
  },
  {
    skuPartNumber: 'DYN365_TEAM_MEMBERS',
    name: 'Dynamics 365 Team Members',
    category: 'dynamics',
  },
  {
    skuPartNumber: 'O365_BUSINESS_ESSENTIALS',
    name: 'Microsoft 365 Business Basic',
    category: 'microsoft365',
  },
  {
    skuPartNumber: 'O365_BUSINESS_PREMIUM',
    name: 'Microsoft 365 Business Standard',
    category: 'microsoft365',
  },
  {
    skuPartNumber: 'SPB',
    name: 'Microsoft 365 Business Premium',
    category: 'microsoft365',
  },
  { skuPartNumber: 'STANDARDPACK', name: 'Office 365 E1', category: 'microsoft365' },
  {
    skuPartNumber: 'ENTERPRISEPACK',
    name: 'Office 365 E3',
    category: 'microsoft365',
  },
  {
    skuPartNumber: 'ENTERPRISEPREMIUM',
    name: 'Office 365 E5',
    category: 'microsoft365',
  },
  {
    skuPartNumber: 'SPE_E3',
    name: 'Microsoft 365 E3',
    category: 'microsoft365',
  },
  {
    skuPartNumber: 'SPE_E5',
    name: 'Microsoft 365 E5',
    category: 'microsoft365',
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
  /** Every paid licence they hold, by category */
  microsoft365: LicenceSku[];
  dynamics: LicenceSku[];
  other: LicenceSku[];
  flags: LicenceFlag[];
}

/**
 * Each licensed user's licences, keyed by user principal name (lower case), with the
 * flags. Free and trial licences are left out (nobody pays for them).
 */
export function getPeopleLicences(
  skus: readonly SubscribedSku[],
  users: readonly LicensedUser[]
): Map<string, PersonLicences> {
  const skuById = new Map(skus.map((sku) => [sku.skuId, sku]));
  // A Dynamics 365 app the org has bought: what Essentials Attach needs, and what makes
  // Dynamics 365 Team Members a sensible licence
  const hasAttachBase = skus.some(
    (s) => isAttachBaseSku(s.skuPartNumber) && s.prepaidUnits.enabled > 0
  );

  const people = new Map<string, PersonLicences>();
  for (const user of users) {
    const held = user.assignedLicenses
      .map((l) => skuById.get(l.skuId))
      .filter((s): s is SubscribedSku => !!s);
    const paid = held.filter((s) => !isFreeOrTrialSku(s.skuPartNumber));
    const visible = paid.map((s) => getLicenceSku(s.skuPartNumber));

    const bc = visible
      .filter((s) => s.category === 'businessCentral')
      .sort((a, b) => (b.bcRank ?? 0) - (a.bcRank ?? 0));
    const parts = held.map((s) => s.skuPartNumber);
    const flags: LicenceFlag[] = [];
    if (parts.some(isEssentialsAttach) && !parts.some(isAttachBaseSku)) {
      flags.push('attachWithoutBase');
    }
    if (parts.some((p) => p.toUpperCase() === 'DYN365_TEAM_MEMBERS') && !hasAttachBase) {
      flags.push('dynamicsTeamMembersInBcOnlyOrg');
    }
    if (!user.accountEnabled && paid.length > 0) flags.push('licensedButDisabled');

    people.set(user.userPrincipalName.toLowerCase(), {
      user,
      businessCentral: bc[0] ?? null,
      microsoft365: visible.filter((s) => s.category === 'microsoft365'),
      dynamics: visible.filter((s) => s.category === 'dynamics'),
      other: visible.filter((s) => s.category === 'other'),
      flags,
    });
  }
  return people;
}

export interface LicenceCount {
  sku: LicenceSku;
  skuId: string;
  assigned: number;
  purchased: number;
  /** Purchased but not given to anyone */
  unassigned: number;
  /** Estimated price a month, and of everything purchased; null without an estimate */
  monthlyPrice: number | null;
  monthlyCost: number | null;
}

/**
 * How many of each paid licence the organisation has bought and assigned: Business
 * Central first (highest first), then Dynamics 365, then Microsoft 365 and the rest,
 * with estimated prices (src/config/licencePrices.json).
 */
export function getLicenceCounts(skus: readonly SubscribedSku[]): LicenceCount[] {
  const order: LicenceCategory[] = ['businessCentral', 'dynamics', 'microsoft365', 'other'];
  return skus
    .filter(
      (s) =>
        !isFreeOrTrialSku(s.skuPartNumber) && (s.prepaidUnits.enabled > 0 || s.consumedUnits > 0)
    )
    .map((s) => {
      const monthlyPrice = getEstimatedPrice(s.skuPartNumber);
      return {
        sku: getLicenceSku(s.skuPartNumber),
        skuId: s.skuId,
        assigned: s.consumedUnits,
        purchased: s.prepaidUnits.enabled,
        unassigned: Math.max(0, s.prepaidUnits.enabled - s.consumedUnits),
        monthlyPrice,
        monthlyCost: monthlyPrice === null ? null : monthlyPrice * s.prepaidUnits.enabled,
      };
    })
    .sort(
      (a, b) =>
        order.indexOf(a.sku.category) - order.indexOf(b.sku.category) ||
        (b.sku.bcRank ?? 0) - (a.sku.bcRank ?? 0) ||
        a.sku.name.localeCompare(b.sku.name)
    );
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

export interface LicenceTag {
  /** e.g. "BC Essentials", or "No BC licence" */
  label: string;
  /** Every licence and flag, for the hover text */
  title: string;
  /** Something looks wrong (a flag, or no Business Central licence) */
  warn: boolean;
}

/**
 * A team member's licence tag: their Business Central licence, amber when they have
 * none (they need one to keep a time sheet) or something looks wrong. `person` null:
 * matched to a directory user with no licences at all.
 */
export function getLicenceTag(person: PersonLicences | null): LicenceTag {
  if (!person) {
    return {
      label: 'No licence',
      title: 'No Business Central or Microsoft 365 licence',
      warn: true,
    };
  }
  const bc = person.businessCentral;
  const lines = [
    `Business Central: ${bc?.name ?? 'none'}`,
    `Microsoft 365: ${person.microsoft365.map((s) => s.name).join(', ') || 'none'}`,
    ...[...person.dynamics, ...person.other].map((s) => `Also: ${s.name}`),
    ...person.flags.map((flag) => `⚠ ${LICENCE_FLAG_LABELS[flag]}`),
  ];
  return {
    label: bc ? (bc.shortName ?? bc.name) : 'No BC licence',
    title: lines.join('\n'),
    warn: !bc || person.flags.length > 0,
  };
}
