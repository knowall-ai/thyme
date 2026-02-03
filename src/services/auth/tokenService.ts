import { SilentRequest } from '@azure/msal-browser';
import { bcTokenRequest, graphTokenRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';

// Track if Graph token acquisition has failed to prevent repeated attempts
let graphTokenFailed = false;

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
  } catch {
    // Silent acquisition failed - don't automatically redirect
    // This prevents redirect loops when background token refresh fails
    // User can manually sign in via the login button if needed
    console.warn('Silent token acquisition failed - user may need to re-authenticate');
    return null;
  }
}

export async function getBCAccessToken(): Promise<string | null> {
  return getAccessToken(bcTokenRequest.scopes);
}

/**
 * Get Graph API access token for profile photos.
 * Silently fails if user hasn't consented to Graph scopes.
 * Note: The app logs in with BC scopes only. Graph scopes (User.ReadBasic.All)
 * require separate consent which hasn't been implemented yet.
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
  } catch {
    // Silent acquisition failed - Graph scopes not consented
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
