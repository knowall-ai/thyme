/**
 * Which AI agent an organisation uses: Timmie's own, or one of its own (e.g. KnowAll's
 * Poppie). The agent's name is what Timmie shows ("Ask Poppie to look again") and how it
 * recognises the agent's heartbeat in Business Central. Shared by the browser and the
 * /api/org-settings route.
 */

export type AgentKind = 'timmie' | 'custom';

export interface AgentSettings {
  kind: AgentKind;
  name: string;
}

/** Timmie's own agent: the default for every organisation */
export const TIMMIE_AGENT: AgentSettings = { kind: 'timmie', name: 'Timmie' };

/** The Entra app role that may change organisation settings */
export const TIMMIE_ADMIN_ROLE = 'Timmie.Admin';

export const AGENT_NAME_MAX_LENGTH = 40;

// A letter first, then letters, digits, spaces and . ' - (e.g. "Poppie", "Agent O'Neill")
const AGENT_NAME = /^\p{L}[\p{L}\p{N} .'-]*$/u;

/** The name, trimmed with single spaces, or null when it isn't a usable agent name */
export function normaliseAgentName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > AGENT_NAME_MAX_LENGTH || !AGENT_NAME.test(name)) return null;
  return name;
}

/**
 * Valid agent settings from untrusted input, or null. Timmie's agent is always called
 * Timmie; a custom agent needs a valid name.
 */
export function normaliseAgentSettings(value: unknown): AgentSettings | null {
  if (!value || typeof value !== 'object') return null;
  const { kind, name } = value as { kind?: unknown; name?: unknown };
  if (kind === 'timmie') return TIMMIE_AGENT;
  if (kind !== 'custom') return null;
  const customName = normaliseAgentName(name);
  return customName ? { kind: 'custom', name: customName } : null;
}

/** Does the ID token's `roles` claim include the Timmie admin role? */
export function isTimmieAdmin(roles: unknown): boolean {
  return Array.isArray(roles) && roles.includes(TIMMIE_ADMIN_ROLE);
}
