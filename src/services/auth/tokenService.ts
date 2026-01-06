import { SilentRequest } from '@azure/msal-browser';
import { bcTokenRequest, graphTokenRequest, devopsTokenRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';

export async function getAccessToken(
  scopes: string[] = bcTokenRequest.scopes
): Promise<string | null> {
  try {
    // Ensure MSAL is initialized before making any calls
    await initializeMsal();

    const account = msalInstance.getActiveAccount();

    if (!account) {
      console.error('No active account found');
      return null;
    }

    const request: SilentRequest = {
      scopes,
      account,
    };

    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    console.error('Failed to acquire token silently:', error);

    // If silent acquisition fails, redirect to login
    try {
      await msalInstance.acquireTokenRedirect({ scopes });
      // This won't return - browser will redirect
      return null;
    } catch (redirectError) {
      console.error('Failed to acquire token via redirect:', redirectError);
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

export async function getDevOpsAccessToken(): Promise<string | null> {
  return getAccessToken(devopsTokenRequest.scopes);
}
