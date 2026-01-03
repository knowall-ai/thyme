import { PublicClientApplication, SilentRequest } from '@azure/msal-browser';
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

    // If silent acquisition fails, try popup
    try {
      const instance = await getMsalInstance();
      const response = await instance.acquireTokenPopup({ scopes });
      return response.accessToken;
    } catch (popupError) {
      console.error('Failed to acquire token via popup:', popupError);
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
