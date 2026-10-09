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

// The one sign-in in progress, shared by every caller that hits an expired sign-in
let pending: Promise<void> | null = null;
let backstop: ReturnType<typeof setTimeout> | null = null;

/** If a redirect hasn't navigated away by now, it isn't going to: let the user retry */
export const REDIRECT_BACKSTOP_MS = 20_000;

function fallBackToManual(attempt: Promise<void>): void {
  // Ignore a stale attempt that has already been replaced
  if (pending !== attempt) return;
  pending = null;
  if (backstop) clearTimeout(backstop);
  backstop = null;
  setStatus('manual');
}

function startSignIn(): Promise<void> {
  if (pending) return pending;
  setStatus('redirecting');
  recordRedirect();
  const request = {
    scopes: loginRequest.scopes,
    account: msalInstance.getActiveAccount() ?? undefined,
  };
  const embedded = isEmbeddedWindow();
  const attempt = embedded
    ? // Redirects are blocked in iframes (and would replace a popup's page): use a popup,
      // then reload so every page refetches with the new tokens
      msalInstance.acquireTokenPopup(request).then(() => {
        setStatus('idle');
        window.location.reload();
      })
    : msalInstance
        .acquireTokenRedirect({
          ...request,
          // Come back to the exact page (company path, query and hash) after signing in
          redirectStartPage: window.location.href,
        })
        .then(() => undefined);
  const tracked: Promise<void> = attempt.catch((error: unknown) => {
    // Includes interaction_in_progress (another sign-in already running): show the
    // prompt again so the user can retry rather than leaving the button stuck
    console.warn('Could not start sign-in', error);
    fallBackToManual(tracked);
  });
  pending = tracked;
  if (!embedded) {
    backstop = setTimeout(() => fallBackToManual(tracked), REDIRECT_BACKSTOP_MS);
  }
  return tracked;
}

/**
 * Called when a token request needs the user to sign in again. Redirects to
 * Microsoft once (single-flight across all callers), unless that could loop or
 * we're in a popup/iframe, in which case the UI shows a "Sign in again" prompt.
 */
export function requestReauth(): Promise<void> {
  if (pending) return pending;
  if (useReauthStore.getState().status === 'manual') return Promise.resolve();
  if (!canAutoRedirect()) {
    setStatus('manual');
    return Promise.resolve();
  }
  return startSignIn();
}

/**
 * User-initiated "Sign in again": always starts a sign-in (still single-flight):
 * a redirect normally, or a popup when Thyme is in an iframe or popup.
 */
export function signInAgain(): Promise<void> {
  return startSignIn();
}

/** Test helper: forget any in-flight redirect and return to `idle`. */
export function resetReauthState(): void {
  pending = null;
  if (backstop) clearTimeout(backstop);
  backstop = null;
  setStatus('idle');
}
