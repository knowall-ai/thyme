import { SilentRequest } from '@azure/msal-browser';
import { bcTokenRequest, graphTokenRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';

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

export async function getGraphAccessToken(): Promise<string | null> {
  return getAccessToken(graphTokenRequest.scopes);
}
