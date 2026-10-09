import { InteractionRequiredAuthError } from '@azure/msal-browser';

/**
 * Thrown when a token can't be refreshed silently because Microsoft Entra needs the
 * user to sign in again (session expired, MFA re-verification, revoked consent, …).
 * Distinct from other token failures so the UI can say "sign in again" instead of
 * blaming Business Central.
 */
export class ReauthRequiredError extends Error {
  readonly originalError: unknown;

  constructor(originalError?: unknown) {
    super('Your sign-in has expired. Sign in again to continue.');
    this.name = 'ReauthRequiredError';
    this.originalError = originalError;
  }
}

export function isReauthRequiredError(error: unknown): error is ReauthRequiredError {
  return error instanceof ReauthRequiredError;
}

// MSAL error codes / OAuth errors that only an interactive sign-in can fix
const INTERACTION_REQUIRED_CODES = new Set([
  'interaction_required',
  'login_required',
  'consent_required',
  'invalid_grant',
  'no_tokens_found',
  'refresh_token_expired',
  'native_account_unavailable',
  'bad_token',
]);

// Entra (AADSTS) codes that mean the user must sign in, verify or consent again
const INTERACTION_REQUIRED_AADSTS = new Set([
  '16000', // account selection required
  '50058', // no session / not signed in
  '50076', // MFA required (location/policy change)
  '50078', // MFA claims expired
  '50079', // MFA registration required
  '50133', // session invalid after password change
  '50158', // external security challenge not satisfied
  '50173', // grant expired (password changed / revoked)
  '65001', // consent required
  '70043', // refresh token expired (sign-in frequency policy)
  '700082', // refresh token expired due to inactivity
  '700084', // SPA refresh token reached its fixed lifetime
]);

function readString(error: object, key: string): string {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** True when a silent token failure can only be fixed by the user signing in again. */
export function isInteractionRequiredError(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) return true;
  if (!error || typeof error !== 'object') return false;

  const errorCode = readString(error, 'errorCode');
  const subError = readString(error, 'subError');
  if (INTERACTION_REQUIRED_CODES.has(errorCode) || INTERACTION_REQUIRED_CODES.has(subError)) {
    return true;
  }

  const text = `${readString(error, 'errorMessage')} ${readString(error, 'message')}`;
  for (const match of text.matchAll(/AADSTS(\d+)/g)) {
    if (INTERACTION_REQUIRED_AADSTS.has(match[1])) return true;
  }
  return false;
}
