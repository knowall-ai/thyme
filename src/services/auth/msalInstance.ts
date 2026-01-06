import { PublicClientApplication, EventType, AccountInfo } from '@azure/msal-browser';
import { msalConfig } from './msalConfig';

// Single shared MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Track initialization state
let initializationPromise: Promise<void> | null = null;

export async function initializeMsal(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = msalInstance.initialize().then(() => {
      // Handle redirect response
      msalInstance.handleRedirectPromise().then((response) => {
        if (response) {
          msalInstance.setActiveAccount(response.account);
        } else {
          // Account selection logic
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }
      });

      // Listen for sign-in events
      msalInstance.addEventCallback((event) => {
        if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
          const account = event.payload as AccountInfo;
          msalInstance.setActiveAccount(account);
        }
      });
    });
  }
  return initializationPromise;
}

export function isInitialized(): boolean {
  return initializationPromise !== null;
}
