import { Configuration, LogLevel, PopupRequest } from '@azure/msal-browser';

// Get redirect URI dynamically from current origin, env var, or fallback
const getRedirectUri = (): string => {
  // In browser, use current origin (works with any port)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // SSR fallback to env var or default
  return process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI || 'http://localhost:3000';
};

// MSAL configuration for Microsoft Entra ID
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID || 'common'}`,
    redirectUri: getRedirectUri(),
    postLogoutRedirectUri: getRedirectUri(),
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Scopes for Microsoft Graph (user profile)
export const graphScopes: string[] = ['User.Read'];

// Scopes for Business Central API
export const bcScopes: string[] = ['https://api.businesscentral.dynamics.com/.default'];

// Login request configuration
// Note: .default scope cannot be combined with other scopes
// We use BC scopes for login, and acquire Graph tokens separately if needed
export const loginRequest: PopupRequest = {
  scopes: bcScopes,
};

// Silent token request for BC API
export const bcTokenRequest = {
  scopes: bcScopes,
};

// Silent token request for Graph API
export const graphTokenRequest = {
  scopes: graphScopes,
};
