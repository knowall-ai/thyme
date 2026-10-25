import { create } from 'zustand';
import {
  fetchOrgSettings,
  saveAgentSettings,
  type OrgSettings,
} from '@/services/settings/orgSettingsService';
import { TIMMIE_AGENT, type AgentSettings } from '@/utils/agentSettings';

/**
 * The organisation's AI agent (Timmie's, or the organisation's own), loaded once per
 * session after the organisation is approved. Until it loads, or if it can't, Timmie's
 * agent is assumed.
 */
interface AgentSettingsStore {
  agent: AgentSettings;
  canEdit: boolean;
  /** Can the server store settings? (False: it isn't configured with settings storage) */
  canSave: boolean;
  loaded: boolean;

  /** Load the settings (no-op once loaded or while loading) */
  load: () => Promise<void>;
  /** Save new settings (admins only); throws OrgSettingsError on failure */
  save: (agent: AgentSettings) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useAgentSettingsStore = create<AgentSettingsStore>((set, get) => ({
  agent: TIMMIE_AGENT,
  canEdit: false,
  canSave: true,
  loaded: false,

  load: () => {
    if (get().loaded) return Promise.resolve();
    inFlight ??= fetchOrgSettings()
      .then((settings: OrgSettings) => set({ ...settings, loaded: true }))
      .catch((error) => console.warn('Could not load organisation settings', error))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  save: async (agent) => {
    const settings = await saveAgentSettings(agent);
    set({ ...settings, loaded: true });
  },
}));

/** The display name of the organisation's AI agent, e.g. "Timmie" */
export function useAgentName(): string {
  return useAgentSettingsStore((state) => state.agent.name);
}
