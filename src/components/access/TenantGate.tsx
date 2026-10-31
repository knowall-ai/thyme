'use client';

import { useEffect, type ReactNode } from 'react';
import { useAgentSettingsStore } from '@/hooks/useAgentSettingsStore';
import { SignInExpired } from '@/components/layout/SignInExpired';
import { NotApprovedPage } from './NotApprovedPage';
import { useTenantAccess } from './useTenantAccess';

/**
 * Only organisations KnowAll has approved can use Timmie. Wraps everything a signed-in
 * user sees under a company, so nothing loads from Business Central (not even the
 * company list) until their organisation (the `tid` claim) is approved. Everyone else
 * gets the "not set up yet" page. Per-user rules (company access, permissions) still
 * apply inside it.
 */
export function TenantGate({ children }: { children: ReactNode }) {
  const { status, tenantId, email, retry } = useTenantAccess();

  if (status === 'approved') return <AgentSettingsLoader>{children}</AgentSettingsLoader>;

  if (status === 'denied' || status === 'signed-out') {
    return <NotApprovedPage tenantId={tenantId} email={email} />;
  }

  if (status === 'reauth') return <SignInExpired />;

  if (status === 'error') {
    return <NotApprovedPage tenantId={tenantId} email={email} onRetry={retry} />;
  }

  return (
    <div className="bg-dark-950 flex min-h-screen items-center justify-center" role="status">
      <div className="border-brand h-8 w-8 animate-spin rounded-full border-b-2" />
      <span className="text-dark-400 ml-3 text-sm">Checking your organisation...</span>
    </div>
  );
}

/** Loads the organisation's agent settings once it's approved; renders its children at once */
function AgentSettingsLoader({ children }: { children: ReactNode }) {
  const load = useAgentSettingsStore((state) => state.load);
  useEffect(() => {
    void load();
  }, [load]);
  return <>{children}</>;
}
