/**
 * Server-side verification of a Microsoft Entra ID (v2.0) ID token, so the server
 * decides which organisation someone belongs to from a token Microsoft signed, never
 * from a value the browser chose. Mirrors zaplie-webapp's `backend/tenantAccess.js`.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { normaliseTenantId } from '@/utils/tenantAccess';

/** Entra publishes the signing keys for every tenant here */
export const ENTRA_JWKS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';

let remoteKeySet: JWTVerifyGetKey | null = null;

/** Entra's signing keys, fetched on first use and cached (jose refreshes them on rotation) */
export function entraKeySet(): JWTVerifyGetKey {
  remoteKeySet ??= createRemoteJWKSet(new URL(ENTRA_JWKS_URL));
  return remoteKeySet;
}

/** The token from an `Authorization: Bearer <token>` header, or null */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1] : null;
}

/**
 * Verifies the signature (RS256 only), expiry and audience (Thyme's client ID), and
 * that the issuer is the token's own tenant. Throws when any of these fail.
 */
export async function verifyIdToken(
  token: string,
  clientId: string,
  keySet: JWTVerifyGetKey
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, keySet, {
    audience: clientId,
    algorithms: ['RS256'], // Entra signs ID tokens with RS256
  });
  const tenantId = normaliseTenantId(payload.tid);
  if (tenantId && payload.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`) {
    throw new Error('Token issuer does not match its tenant');
  }
  return payload;
}
