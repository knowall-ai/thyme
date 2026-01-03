import { Configuration, LogLevel, PopupRequest } from '@azure/msal-browser';

// MSAL configuration for Microsoft Entra ID
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID || 'common'}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI || 'http://localhost:3000',
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI || 'http://localhost:3000',
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
export const bcScopes: string[] = [
  'https://api.businesscentral.dynamics.com/.default',
];

// Login request configuration
export const loginRequest: PopupRequest = {
  scopes: [...graphScopes, ...bcScopes],
};

// Silent token request for BC API
export const bcTokenRequest = {
  scopes: bcScopes,
};

// Silent token request for Graph API
export const graphTokenRequest = {
  scopes: graphScopes,
};
