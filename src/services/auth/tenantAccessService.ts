'use client';

/**
 * Asks Thyme's server whether the signed-in organisation is approved (see
 * `/api/tenant-access`), and Microsoft Graph for the organisation's name to show
 * someone who isn't approved yet.
 */

import { KNOWALL_TENANT_ID, normaliseTenantId } from '@/utils/tenantAccess';
import { getGraphAccessToken } from './tokenService';

const TIMEOUT_MS = 15_000;

/**
 * True when the tenant is approved, false when it isn't (or the tenant ID is missing
 * or malformed). Throws when the server couldn't say, so the caller can offer a retry
 * rather than wrongly telling an approved organisation it isn't set up.
 */
export async function checkTenantApproved(tid: string | null): Promise<boolean> {
  const id = normaliseTenantId(tid);
  if (!id) return false;
  // KnowAll (and guests invited into it) needs no round trip
  if (id === KNOWALL_TENANT_ID) return true;

  const response = await fetch(`/api/tenant-access?tid=${encodeURIComponent(id)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error(`Tenant access check failed (${response.status})`);
  const body = (await response.json()) as { approved?: unknown };
  return body.approved === true;
}

/** The signed-in user's organisation name from Microsoft Graph, or null */
export async function getOrganisationName(): Promise<string | null> {
  try {
    const token = await getGraphAccessToken();
    if (!token) return null;
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/organization?$select=displayName',
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { value?: { displayName?: string }[] };
    return body.value?.[0]?.displayName?.trim() || null;
  } catch {
    return null;
  }
}
