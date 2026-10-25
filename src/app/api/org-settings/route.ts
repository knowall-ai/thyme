/**
 * The signed-in organisation's Timmie settings: which AI agent it uses. The caller sends
 * its Entra ID token (`Authorization: Bearer <id token>`); the server verifies it and uses
 * the token's own `tid`, so nobody can read or change another organisation's settings.
 *
 * GET: any signed-in user of an approved organisation. Returns the agent (Timmie's by
 * default) and whether this user may change it.
 * PUT `{ agent: { kind: 'timmie' } | { kind: 'custom', name } }`: users with the
 * `Timmie.Admin` app role only.
 *
 * 401 no token or one that fails verification, 403 an unapproved organisation (or a PUT
 * by a non-admin), 400 invalid settings, 503 the server can't verify tokens or reach
 * the settings store.
 */

import type { NextRequest } from 'next/server';
import type { JWTPayload } from 'jose';
import { bearerToken, entraKeySet, verifyIdToken } from '@/services/auth/idTokenVerifier';
import { getOrgSettingsStore } from '@/services/settings/orgSettingsStore';
import { isTenantApproved, normaliseTenantId, parseApprovedTenantIds } from '@/utils/tenantAccess';
import { TIMMIE_AGENT, isTimmieAdmin, normaliseAgentSettings } from '@/utils/agentSettings';

const headers = { 'cache-control': 'no-store' };

type Caller = { tenantId: string; payload: JWTPayload } | { error: Response };

/** The verified caller and their organisation, or the response to send instead */
async function authenticate(request: NextRequest): Promise<Caller> {
  const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
  if (!clientId) {
    return { error: Response.json({ code: 'auth_not_configured' }, { status: 503, headers }) };
  }
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return { error: Response.json({}, { status: 401, headers }) };

  let payload: JWTPayload;
  try {
    payload = await verifyIdToken(token, clientId, entraKeySet());
  } catch {
    return { error: Response.json({}, { status: 401, headers }) };
  }

  const tenantId = normaliseTenantId(payload.tid);
  const approved = parseApprovedTenantIds(process.env.APPROVED_TENANT_IDS);
  if (!tenantId || !isTenantApproved(tenantId, approved)) {
    return { error: Response.json({}, { status: 403, headers }) };
  }
  return { tenantId, payload };
}

function storeUnavailable(error: unknown): Response {
  console.error('Organisation settings store failed', error);
  return Response.json({ code: 'settings_unavailable' }, { status: 503, headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  const caller = await authenticate(request);
  if ('error' in caller) return caller.error;

  try {
    const agent = (await getOrgSettingsStore().getAgent(caller.tenantId)) ?? TIMMIE_AGENT;
    return Response.json({ agent, canEdit: isTimmieAdmin(caller.payload.roles) }, { headers });
  } catch (error) {
    return storeUnavailable(error);
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  const caller = await authenticate(request);
  if ('error' in caller) return caller.error;
  if (!isTimmieAdmin(caller.payload.roles)) {
    return Response.json({ code: 'not_admin' }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const agent = normaliseAgentSettings((body as { agent?: unknown } | null)?.agent);
  if (!agent) return Response.json({ code: 'invalid_agent' }, { status: 400, headers });

  // Who changed it, for support: the user's sign-in name, or their object ID
  const updatedBy = String(caller.payload.preferred_username ?? caller.payload.oid ?? '');
  try {
    await getOrgSettingsStore().setAgent(caller.tenantId, agent, updatedBy);
    return Response.json({ agent, canEdit: true }, { headers });
  } catch (error) {
    return storeUnavailable(error);
  }
}

export const dynamic = 'force-dynamic';
