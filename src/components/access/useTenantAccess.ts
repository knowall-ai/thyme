'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useReauthStore } from '@/services/auth';
import { checkTenantApproved } from '@/services/auth/tenantAccessService';
import { KNOWALL_TENANT_ID, getAccountTenantId } from '@/utils/tenantAccess';

/** 'reauth': the check failed because Entra needs the user to sign in again */
export type TenantAccessStatus =
  | 'signed-out'
  | 'checking'
  | 'approved'
  | 'denied'
  | 'error'
  | 'reauth';

// One server check per tenant per page load, shared by the gate and the header
const checks = new Map<string, Promise<boolean>>();

function checkOnce(tid: string): Promise<boolean> {
  let check = checks.get(tid);
  if (!check) {
    check = checkTenantApproved(tid);
    // A failed check can be retried
    check.catch(() => checks.delete(tid));
    checks.set(tid, check);
  }
  return check;
}

/** Forget cached answers (tests) */
export function resetTenantAccessCache(): void {
  checks.clear();
}

/**
 * Is the signed-in user's organisation (the `tid` claim) approved to use Timmie? A
 * missing or malformed `tid` is 'denied'; KnowAll's own tenant is approved at once.
 */
export function useTenantAccess() {
  const { account, isAuthenticated } = useAuth();
  const tid = getAccountTenantId(account);
  // The server's answer, for the tenant it was asked about
  const [check, setCheck] = useState<{ tid: string; status: TenantAccessStatus } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const needsServer = isAuthenticated && !!tid && tid !== KNOWALL_TENANT_ID;

  useEffect(() => {
    if (!needsServer || !tid) return;
    let cancelled = false;
    checkOnce(tid)
      .then((approved) => {
        if (!cancelled) setCheck({ tid, status: approved ? 'approved' : 'denied' });
      })
      .catch(() => {
        if (!cancelled) setCheck({ tid, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [needsServer, tid, attempt]);

  const retry = useCallback(() => {
    setCheck(null);
    setAttempt((n) => n + 1);
  }, []);

  // Set when a token needs an interactive sign-in that couldn't start by itself
  const reauthRequired = useReauthStore((state) => state.status === 'manual');

  const checked: TenantAccessStatus = !isAuthenticated
    ? 'signed-out'
    : !tid
      ? 'denied'
      : tid === KNOWALL_TENANT_ID
        ? 'approved'
        : check?.tid === tid
          ? check.status
          : 'checking';
  // Retrying can't fix a sign-in that has expired; signing in again can
  const status = checked === 'error' && reauthRequired ? 'reauth' : checked;

  return { status, tenantId: tid, email: account?.username ?? null, retry };
}
