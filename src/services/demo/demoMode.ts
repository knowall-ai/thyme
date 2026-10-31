import type { AccountInfo } from '@azure/msal-browser';
import type { BCEnvironmentType } from '@/types';

/**
 * Demo mode: Timmie running in the browser on built-in sample data (a fictional company,
 * Contoso Ltd), with no Microsoft sign-in and no Business Central.
 *
 * It's switched on per browser tab by a sessionStorage flag, set by "Try the demo" just
 * before a full page load, and switched off by a full page load after clearing it, so no
 * in-memory state crosses between the demo and a real session. While it's on:
 *
 * - every Business Central call is answered in the browser by the demo data source
 *   (services/demo/demoBcServer), never sent over the network;
 * - the signed-in user is the demo account below, and no token is ever asked of
 *   Microsoft Entra (see tokenService);
 * - anything Timmie would keep in localStorage goes to this tab's sessionStorage instead
 *   (see demoStorage), so the demo can't change a real session's settings.
 */

/** Every sessionStorage key the demo writes starts with this, so exiting clears them all */
export const DEMO_STORAGE_PREFIX = 'timmie_demo';
/** The flag: present ('1') while this tab is in the demo */
export const DEMO_FLAG_KEY = `${DEMO_STORAGE_PREFIX}_active`;

/** The demo company. BC never issues this SystemId, so it can't name a real company. */
export const DEMO_COMPANY_ID = 'de000000-0000-4000-8000-00000000c0de';
export const DEMO_ENVIRONMENT: BCEnvironmentType = 'sandbox';
export const DEMO_COMPANY_NAME = 'Contoso Ltd';

/** The demo's Entra tenant: not a real one (Contoso is a fictional company) */
export const DEMO_TENANT_ID = 'de000000-0000-4000-8000-0000000000d0';

/** The person the visitor plays: a delivery lead who logs time and approves the team's */
export const DEMO_USER = {
  name: 'Alex Morgan',
  username: 'alex.morgan@contoso.com',
} as const;

/** Stands in for a BC access token in the demo; it's never sent anywhere */
export const DEMO_ACCESS_TOKEN = 'timmie-demo-token';

export const DEMO_ACCOUNT: AccountInfo = {
  homeAccountId: `demo.${DEMO_TENANT_ID}`,
  environment: 'demo',
  tenantId: DEMO_TENANT_ID,
  username: DEMO_USER.username,
  localAccountId: 'demo',
  name: DEMO_USER.name,
  idTokenClaims: { tid: DEMO_TENANT_ID, name: DEMO_USER.name },
};

/** The demo's start page: the Time page in the demo company */
export const DEMO_START_PATH = `/${DEMO_ENVIRONMENT}/${DEMO_COMPANY_ID}/time`;

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    // Storage blocked (privacy settings): no demo
    return null;
  }
}

/** True while this browser tab is in the demo */
export function isDemoMode(): boolean {
  return sessionStore()?.getItem(DEMO_FLAG_KEY) === '1';
}

/** Whether a URL company is the demo company (a shared demo link) */
export function isDemoCompany(companyId: string | null | undefined): boolean {
  return (companyId ?? '').toLowerCase() === DEMO_COMPANY_ID;
}

/** Remove everything the demo keeps in this tab (the flag, the sample data, settings) */
export function clearDemoState(): void {
  const storage = sessionStore();
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(DEMO_STORAGE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

/**
 * Turn the demo on for this tab with fresh sample data. Returns false when the browser
 * won't keep the flag (sessionStorage blocked), in which case the demo can't run.
 */
export function enableDemoMode(): boolean {
  const storage = sessionStore();
  if (!storage) return false;
  clearDemoState();
  try {
    storage.setItem(DEMO_FLAG_KEY, '1');
  } catch {
    return false;
  }
  return isDemoMode();
}

/**
 * "Try the demo": switch this tab to the demo and open it with a full page load, so
 * every module starts again in demo mode.
 */
export function startDemo(path: string = DEMO_START_PATH): boolean {
  if (!enableDemoMode()) return false;
  window.location.assign(path);
  return true;
}

/** "Exit demo": forget the demo and its changes, then load the landing page afresh */
export function exitDemo(path = '/'): void {
  clearDemoState();
  window.location.assign(path);
}
