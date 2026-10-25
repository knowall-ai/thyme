'use client';

/** Reads and saves the signed-in organisation's settings through /api/org-settings. */

import { getIdToken } from '@/services/auth/tokenService';
import { normaliseAgentSettings, type AgentSettings } from '@/utils/agentSettings';

const TIMEOUT_MS = 15_000;

export interface OrgSettings {
  agent: AgentSettings;
  /** May this user change the settings (the Timmie.Admin role)? */
  canEdit: boolean;
}

/** Thrown when the server refuses a save, with a message to show the admin */
export class OrgSettingsError extends Error {}

async function request(init: RequestInit = {}): Promise<OrgSettings> {
  const idToken = await getIdToken();
  if (!idToken) throw new OrgSettingsError('You need to be signed in to change settings.');

  const response = await fetch('/api/org-settings', {
    ...init,
    cache: 'no-store',
    headers: { ...init.headers, Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 403) {
    throw new OrgSettingsError('Only Timmie administrators can change this.');
  }
  if (response.status === 400) throw new OrgSettingsError('That agent name isn’t valid.');
  if (!response.ok) {
    throw new OrgSettingsError(`Settings are unavailable right now (${response.status}).`);
  }

  const body = (await response.json()) as { agent?: unknown; canEdit?: unknown };
  const agent = normaliseAgentSettings(body.agent);
  if (!agent) throw new OrgSettingsError('The server sent settings Timmie doesn’t understand.');
  return { agent, canEdit: body.canEdit === true };
}

export function fetchOrgSettings(): Promise<OrgSettings> {
  return request();
}

export function saveAgentSettings(agent: AgentSettings): Promise<OrgSettings> {
  return request({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent }),
  });
}
