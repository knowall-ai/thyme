'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
  useIsAuthenticated,
} from '@azure/msal-react';
import {
  PublicClientApplication,
  EventType,
  AccountInfo,
  InteractionStatus,
} from '@azure/msal-browser';
import { msalConfig, loginRequest } from './msalConfig';

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Set up event callbacks for MSAL
msalInstance.initialize().then(() => {
  // Account selection logic
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  // Listen for sign-in events
  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const account = event.payload as AccountInfo;
      msalInstance.setActiveAccount(account);
    }
  });
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    msalInstance.initialize().then(() => {
      setIsInitialized(true);
    });
  }, []);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-thyme-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

// Hook to get authentication state and methods
export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const login = async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await instance.logoutPopup({
        postLogoutRedirectUri: '/',
      });
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  const getAccount = (): AccountInfo | null => {
    return instance.getActiveAccount() || accounts[0] || null;
  };

  return {
    isAuthenticated,
    isLoading: inProgress !== InteractionStatus.None,
    account: getAccount(),
    login,
    logout,
    instance,
  };
}

// Export template components for conditional rendering
export { AuthenticatedTemplate, UnauthenticatedTemplate };
