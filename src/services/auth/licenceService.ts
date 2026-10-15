'use client';

/**
 * Licences from Microsoft Graph: the organisation's subscribed SKUs, its users'
 * assigned licences, and whether the signed-in user is an admin who may see them.
 *
 * Needs the delegated Directory.Read.All permission, which only an administrator can
 * consent to. It isn't part of sign-in: the token is only ever asked for silently here
 * (never forcing a sign-in on anyone), and an admin grants it once from Settings
 * (requestLicenceConsent).
 */

import { msalInstance, initializeMsal } from './msalInstance';
import {
  LICENCE_ADMIN_ROLE_TEMPLATE_IDS,
  type LicensedUser,
  type SubscribedSku,
} from '@/utils/licences';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const LICENCE_SCOPES = ['https://graph.microsoft.com/Directory.Read.All'];
const TIMEOUT_MS = 20_000;
// Users come 999 a page: enough for any organisation Thyme serves in a few requests
const MAX_PAGES = 20;

/** The directory token, or null when it isn't granted (or there's no account) */
export async function getLicenceToken(): Promise<string | null> {
  try {
    await initializeMsal();
    const account = msalInstance.getActiveAccount();
    if (!account) return null;
    const response = await msalInstance.acquireTokenSilent({ scopes: LICENCE_SCOPES, account });
    return response.accessToken;
  } catch {
    // Not consented, or needs interaction: no licence view, and no sign-in redirect
    return null;
  }
}

/**
 * Asks Microsoft for the directory permission (an administrator's consent), coming back
 * to this page. Someone who isn't an admin sees Microsoft's "Need admin approval".
 */
export async function requestLicenceConsent(): Promise<void> {
  await initializeMsal();
  const account = msalInstance.getActiveAccount() ?? undefined;
  await msalInstance.acquireTokenRedirect({
    scopes: LICENCE_SCOPES,
    account,
    redirectStartPage: window.location.href,
  });
}

async function graphGet<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Microsoft Graph error (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

/** Every page of a Graph collection */
async function graphGetAll<T>(token: string, url: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const body: { value: T[]; '@odata.nextLink'?: string } = await graphGet(token, next);
    items.push(...body.value);
    // Only follow links back to Graph (the request carries the token)
    next = body['@odata.nextLink']?.startsWith(`${GRAPH}/`) ? body['@odata.nextLink'] : undefined;
  }
  return items;
}

/**
^ * Whether the signed-in user holds (directly or through a group) an Entra role that may see licences (see
 * LICENCE_ADMIN_ROLE_TEMPLATE_IDS). False when the roles can't be read.
 */
export async function isLicenceAdmin(token: string): Promise<boolean> {
  try {
    const roles = await graphGetAll<{ roleTemplateId?: string }>(
      token,
      `${GRAPH}/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=roleTemplateId`
    );
    return roles.some(
      (r) => !!r.roleTemplateId && LICENCE_ADMIN_ROLE_TEMPLATE_IDS.has(r.roleTemplateId)
    );
  } catch {
    return false;
  }
}

/** The organisation's SKUs, with how many are purchased and assigned */
export function getSubscribedSkus(token: string): Promise<SubscribedSku[]> {
  return graphGetAll<SubscribedSku>(
    token,
    `${GRAPH}/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits`
  );
}

/** Every user with at least one licence */
export async function getLicensedUsers(token: string): Promise<LicensedUser[]> {
  const users = await graphGetAll<LicensedUser>(
    token,
    `${GRAPH}/users?$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses&$top=999`
  );
  return users.filter((u) => u.assignedLicenses?.length > 0);
}
