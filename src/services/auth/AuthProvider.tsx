'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
  useIsAuthenticated,
} from '@azure/msal-react';
import { AccountInfo, InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';
import { clearProfilePhotoCache } from './graphService';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeMsal().then(() => {
      setIsInitialized(true);
    });
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-thyme-600"></div>
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
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      clearProfilePhotoCache();
      await instance.logoutRedirect({
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
