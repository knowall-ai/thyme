'use client';

import { ReactNode, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  MsalProvider,
  AuthenticatedTemplate as MsalAuthenticatedTemplate,
  UnauthenticatedTemplate as MsalUnauthenticatedTemplate,
  useMsal,
  useIsAuthenticated,
} from '@azure/msal-react';
import { AccountInfo, InteractionStatus } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';
import { msalInstance, initializeMsal } from './msalInstance';
import { clearProfilePhotoCache } from './graphService';
import { clearResourceIdentityCache } from './resourceIdentity';
import { clearReviewerPhotoCache } from './reviewerIdentity';
import { resetGraphConsentState } from './tokenService';
import { DEMO_ACCOUNT, clearDemoState, exitDemo } from '../demo/demoMode';
import { useIsDemoMode } from '../demo/useIsDemoMode';

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
          <div className="border-brand-on-light mx-auto h-12 w-12 animate-spin rounded-full border-b-2"></div>
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
  const isDemo = useIsDemoMode();

  const login = async () => {
    try {
      // Signing in from the demo leaves it first, so the real session starts clean, and
      // comes back to the landing page rather than the demo page it started from
      if (isDemo) {
        clearDemoState();
        await instance.loginRedirect({
          ...loginRequest,
          redirectStartPage: `${window.location.origin}/`,
        });
        return;
      }
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      toast.error('Login failed. Please try again.');
      throw error;
    }
  };

  const logout = async () => {
    try {
      clearProfilePhotoCache();
      clearResourceIdentityCache();
      clearReviewerPhotoCache();
      resetGraphConsentState();
      const account = instance.getActiveAccount();
      await instance.logoutRedirect({
        account: account || undefined,
        postLogoutRedirectUri: window.location.origin,
      });
    } catch (error) {
      throw error;
    }
  };

  const getAccount = (): AccountInfo | null => {
    return instance.getActiveAccount() || accounts[0] || null;
  };

  // The demo plays a fictional user; any real Microsoft account stays untouched
  if (isDemo) {
    return {
      isAuthenticated: true,
      isLoading: false,
      account: DEMO_ACCOUNT,
      login,
      logout: async () => exitDemo(),
      instance,
    };
  }

  return {
    isAuthenticated,
    isLoading: inProgress !== InteractionStatus.None,
    account: getAccount(),
    login,
    logout,
    instance,
  };
}

/** Renders its children when signed in (in the demo, always) */
export function AuthenticatedTemplate({ children }: { children?: ReactNode }) {
  const isDemo = useIsDemoMode();
  if (isDemo) return <>{children}</>;
  return <MsalAuthenticatedTemplate>{children}</MsalAuthenticatedTemplate>;
}

/** Renders its children when signed out (in the demo, never) */
export function UnauthenticatedTemplate({ children }: { children?: ReactNode }) {
  const isDemo = useIsDemoMode();
  if (isDemo) return null;
  return <MsalUnauthenticatedTemplate>{children}</MsalUnauthenticatedTemplate>;
}
