/**
 * Is the signed-in organisation approved to use Timmie? Timmie's pages ask before showing
 * anything company-scoped. The caller sends its Entra ID token
 * (`Authorization: Bearer <id token>`); the server verifies it and decides from the
 * token's own `tid`, so nobody can ask about a tenant they didn't sign in from.
 *
 * The list lives on the server (the `APPROVED_TENANT_IDS` App Service setting) and is
 * read on every request, so approving an organisation is a setting change and an app
 * restart, not a rebuild. Only the answer goes back, never the list.
 *
 * 200 approved, 403 not approved (or the token has no tenant), 401 no token or one that
 * fails verification, 503 the server has no client ID to verify tokens against.
 */

import type { NextRequest } from 'next/server';
import { bearerToken, entraKeySet, verifyIdToken } from '@/services/auth/idTokenVerifier';
import { isTenantApproved, parseApprovedTenantIds } from '@/utils/tenantAccess';

export async function GET(request: NextRequest): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };

  const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { approved: false, code: 'auth_not_configured' },
      { status: 503, headers }
    );
  }

  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return Response.json({ approved: false }, { status: 401, headers });

  let tid: unknown;
  try {
    ({ tid } = await verifyIdToken(token, clientId, entraKeySet()));
  } catch {
    return Response.json({ approved: false }, { status: 401, headers });
  }

  const approved = isTenantApproved(tid, parseApprovedTenantIds(process.env.APPROVED_TENANT_IDS));
  return Response.json({ approved }, { status: approved ? 200 : 403, headers });
}

export const dynamic = 'force-dynamic';
