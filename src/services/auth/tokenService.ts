import { SilentRequest } from '@azure/msal-browser';
import toast from 'react-hot-toast';
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
      // Use toast ID to prevent duplicate notifications when multiple API calls fail
      toast.error('Session expired. Please sign in again.', { id: 'session-expired' });
      return null;
    }

    const request: SilentRequest = {
      scopes,
      account,
    };

    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken;
  } catch {
    // If silent acquisition fails, redirect to login
    try {
      await msalInstance.acquireTokenRedirect({ scopes });
      // This won't return - browser will redirect
      return null;
    } catch {
      return null;
    }
  }
}

export async function getBCAccessToken(): Promise<string | null> {
  return getAccessToken(bcTokenRequest.scopes);
}

export async function getGraphAccessToken(): Promise<string | null> {
  return getAccessToken(graphTokenRequest.scopes);
}
