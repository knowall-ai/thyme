/**
 * Which organisations may use Thyme. Only organisations KnowAll has approved can sign
 * in: the KnowAll tenant itself (its members, and guests invited into it, who sign in
 * through it), plus any Microsoft Entra tenant listed in `APPROVED_TENANT_IDS`.
 *
 * An organisation is its Entra tenant ID: the `tid` claim of the user's ID token. A
 * missing or malformed `tid` is never approved; there is no default tenant to fall back to.
 */

/** KnowAll AI's Microsoft Entra tenant */
export const KNOWALL_TENANT_ID = 'f36f6414-cb7d-4545-9cf2-7574f7b5c584';

/** Where access requests go */
export const ACCESS_REQUEST_EMAIL = 'hello@knowall.ai';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The tenant ID, lowercased, or null when it isn't a GUID */
export function normaliseTenantId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return GUID.test(id) ? id : null;
}

/**
 * The approved tenants from `APPROVED_TENANT_IDS` (comma-separated GUIDs), lowercased.
 * Anything that isn't a GUID is ignored.
 */
export function parseApprovedTenantIds(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(normaliseTenantId)
    .filter((id): id is string => id !== null);
}

/** Is this tenant KnowAll, or one KnowAll has approved? */
export function isTenantApproved(tid: unknown, approvedTenantIds: readonly string[]): boolean {
  const id = normaliseTenantId(tid);
  if (!id) return false;
  return id === KNOWALL_TENANT_ID || approvedTenantIds.includes(id);
}

/** The `tid` claim of a signed-in account's ID token, if it has one */
export function getAccountTenantId(
  account: { idTokenClaims?: Record<string, unknown> } | null | undefined
): string | null {
  return normaliseTenantId(account?.idTokenClaims?.tid);
}

interface AccessRequest {
  app: string;
  organisationName: string | null;
  tenantId: string | null;
  email: string | null;
}

/** A `mailto:` link for asking KnowAll for access, pre-filled with who is asking */
export function accessRequestMailto({
  app,
  organisationName,
  tenantId,
  email,
}: AccessRequest): string {
  const subject = `${app} access request`;
  const body = [
    `Hello KnowAll,`,
    ``,
    `Please set up our organisation on ${app}.`,
    ``,
    `App: ${app}`,
    `Organisation: ${organisationName || 'Unknown'}`,
    `Tenant ID: ${tenantId || 'Unknown'}`,
    `Email: ${email || 'Unknown'}`,
  ].join('\n');
  return `mailto:${ACCESS_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
