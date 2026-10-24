/**
 * Is an organisation approved to use Thyme? Thyme's pages ask before showing anything
 * company-scoped. The list lives on the server (the `APPROVED_TENANT_IDS` App Service
 * setting) and is read on every request, so approving an organisation is a setting
 * change and an app restart, not a rebuild. Only the answer goes back, never the list.
 *
 * 200 approved, 403 not approved, 401 no (or a malformed) tenant ID.
 */

import type { NextRequest } from 'next/server';
import { isTenantApproved, normaliseTenantId, parseApprovedTenantIds } from '@/utils/tenantAccess';

export async function GET(request: NextRequest): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  const tid = normaliseTenantId(request.nextUrl.searchParams.get('tid'));
  if (!tid) return Response.json({ approved: false }, { status: 401, headers });

  const approved = isTenantApproved(tid, parseApprovedTenantIds(process.env.APPROVED_TENANT_IDS));
  return Response.json({ approved }, { status: approved ? 200 : 403, headers });
}

export const dynamic = 'force-dynamic';
