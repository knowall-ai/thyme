import { PublicClientApplication, SilentRequest } from '@azure/msal-browser';
import toast from 'react-hot-toast';
import { msalConfig, bcTokenRequest, graphTokenRequest } from './msalConfig';

let msalInstance: PublicClientApplication | null = null;

async function getMsalInstance(): Promise<PublicClientApplication> {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
  return msalInstance;
}

export async function getAccessToken(
  scopes: string[] = bcTokenRequest.scopes
): Promise<string | null> {
  try {
    const instance = await getMsalInstance();
    const account = instance.getActiveAccount();

    if (!account) {
      console.error('No active account found');
      toast.error('Session expired. Please sign in again.');
      return null;
    }

    const request: SilentRequest = {
      scopes,
      account,
    };

    const response = await instance.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    console.error('Failed to acquire token silently:', error);

    // If silent acquisition fails, redirect to login
    try {
      const instance = await getMsalInstance();
      await instance.acquireTokenRedirect({ scopes });
      // This won't return - browser will redirect
      return null;
    } catch (redirectError) {
      console.error('Failed to acquire token via redirect:', redirectError);
      toast.error('Authentication failed. Please try signing in again.');
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
