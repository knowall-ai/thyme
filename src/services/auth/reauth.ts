import { create } from 'zustand';
import { loginRequest } from './msalConfig';
import { msalInstance } from './msalInstance';

export {
  ReauthRequiredError,
  isReauthRequiredError,
  isInteractionRequiredError,
} from './reauthErrors';

/**
 * - `idle`: no sign-in problem
 * - `redirecting`: sending the user to Microsoft to sign in again
 * - `manual`: sign-in expired but we won't redirect automatically (loop guard, or
 *   running in a popup/iframe), so the UI asks the user to sign in again
 */
export type ReauthStatus = 'idle' | 'redirecting' | 'manual';

export const useReauthStore = create<{ status: ReauthStatus }>(() => ({ status: 'idle' }));

const setStatus = (status: ReauthStatus) => useReauthStore.setState({ status });

/** sessionStorage key holding when we last redirected to sign in automatically */
export const AUTO_REDIRECT_KEY = 'thyme.reauth.lastAutoRedirectAt';
/** At most one automatic sign-in redirect per tab in this window, to prevent loops */
export const AUTO_REDIRECT_COOLDOWN_MS = 5 * 60 * 1000;

function isEmbeddedWindow(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    // Cross-origin parent: we're framed
    return true;
  }
  return !!window.opener;
}

function lastAutoRedirectAt(): number | null {
  const raw = window.sessionStorage.getItem(AUTO_REDIRECT_KEY);
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) ? at : null;
}

function recordRedirect(): void {
  try {
    window.sessionStorage.setItem(AUTO_REDIRECT_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the guard in canAutoRedirect already stops auto redirects
  }
}

/** Whether we may send the user to sign in without them asking. */
export function canAutoRedirect(now = Date.now()): boolean {
  if (typeof window === 'undefined' || isEmbeddedWindow()) return false;
  try {
    const last = lastAutoRedirectAt();
    return last === null || now - last >= AUTO_REDIRECT_COOLDOWN_MS;
  } catch {
    // No sessionStorage, so no way to detect a loop: let the user choose
    return false;
  }
}

// The one sign-in redirect in progress, shared by every caller that hits an expired sign-in
let redirectPromise: Promise<void> | null = null;

function startRedirect(): Promise<void> {
  if (redirectPromise) return redirectPromise;
  setStatus('redirecting');
  recordRedirect();
  const account = msalInstance.getActiveAccount() ?? undefined;
  redirectPromise = msalInstance
    .acquireTokenRedirect({
      scopes: loginRequest.scopes,
      account,
      // Come back to the exact page (company path, query and hash) after signing in
      redirectStartPage: window.location.href,
    })
    .catch((error: unknown) => {
      const code = (error as { errorCode?: unknown } | null)?.errorCode;
      // Another redirect (e.g. the sign-in button) is already under way
      if (code === 'interaction_in_progress') return;
      console.warn('Could not start sign-in redirect', error);
      redirectPromise = null;
      setStatus('manual');
    });
  return redirectPromise;
}

/**
 * Called when a token request needs the user to sign in again. Redirects to
 * Microsoft once (single-flight across all callers), unless that could loop or
 * we're in a popup/iframe, in which case the UI shows a "Sign in again" prompt.
 */
export function requestReauth(): Promise<void> {
  if (redirectPromise) return redirectPromise;
  if (useReauthStore.getState().status === 'manual') return Promise.resolve();
  if (!canAutoRedirect()) {
    setStatus('manual');
    return Promise.resolve();
  }
  return startRedirect();
}

/** User-initiated "Sign in again": always redirects (still single-flight). */
export function signInAgain(): Promise<void> {
  return startRedirect();
}

/** Test helper: forget any in-flight redirect and return to `idle`. */
export function resetReauthState(): void {
  redirectPromise = null;
  setStatus('idle');
}
