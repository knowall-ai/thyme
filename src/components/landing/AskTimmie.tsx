'use client';

import { useAuth } from '@/services/auth';
import { PublicTimmieLauncher } from '@/components/public-timmie/PublicTimmieLauncher';

/**
 * Ask Timmie on the public pages, for signed-out visitors only. Hidden while MSAL is
 * still working out whether someone is signed in, so it never flashes up inside the app.
 *
 * This wrapper lives outside the public helper on purpose: it may know about sign-in;
 * the helper itself (components/public-timmie, services/public-timmie) may not.
 */
export function AskTimmie() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isAuthenticated || isLoading) return null;
  return <PublicTimmieLauncher />;
}
