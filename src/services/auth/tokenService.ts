import { SilentRequest } from '@azure/msal-browser';
import { bcTokenRequest, graphTokenRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';
import { requestReauth } from './reauth';
import { ReauthRequiredError, isInteractionRequiredError } from './reauthErrors';

// Track if Graph token acquisition has failed to prevent repeated attempts
let graphTokenFailed = false;

/**
 * Get an access token silently. Returns null when there's no signed-in account or
 * the token couldn't be fetched for a transient reason.
 *
 * @throws ReauthRequiredError when Microsoft Entra needs the user to sign in again
 * (expired session, MFA re-verification, …). Before throwing, it starts a single
 * shared sign-in redirect back to the current page, or (if that could loop) flags
 * the UI to show a "Sign in again" prompt.
 */
export async function getAccessToken(
  scopes: string[] = bcTokenRequest.scopes
): Promise<string | null> {
  try {
    // Ensure MSAL is initialized before making any calls
    await initializeMsal();

    const account = msalInstance.getActiveAccount();

    if (!account) {
      // No account - user needs to sign in via the login button
      // Don't show toast here as this is expected on first load
      return null;
    }

    const request: SilentRequest = {
      scopes,
      account,
    };

    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    if (isInteractionRequiredError(error)) {
      console.warn('Sign-in expired - signing in again');
      void requestReauth();
      throw new ReauthRequiredError(error);
    }
    console.warn('Silent token acquisition failed', error);
    return null;
  }
}

export async function getBCAccessToken(): Promise<string | null> {
  return getAccessToken(bcTokenRequest.scopes);
}

/**
 * Get Graph API access token for profile photos.
 * The login request includes Graph scopes (User.Read, User.ReadBasic.All) alongside
 * BC scopes, so tokens can be silently acquired after initial consent.
 * Caches failure state to prevent repeated token requests if consent is missing.
 */
export async function getGraphAccessToken(): Promise<string | null> {
  // If already failed this session, don't retry (prevents log spam)
  if (graphTokenFailed) {
    return null;
  }

  try {
    await initializeMsal();

    const account = msalInstance.getActiveAccount();
    if (!account) {
      return null;
    }

    const request: SilentRequest = {
      scopes: graphTokenRequest.scopes,
      account,
    };

    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    // Expired sign-in: start (or join) the shared sign-in redirect. Photos are
    // optional, so callers still just get null and fall back to initials.
    if (isInteractionRequiredError(error)) {
      void requestReauth();
    }
    // Don't log repeatedly - just mark as failed for this session
    graphTokenFailed = true;
    return null;
  }
}

/**
 * Reset Graph token state (call on logout)
 */
export function resetGraphConsentState(): void {
  graphTokenFailed = false;
}
