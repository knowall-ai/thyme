import { create } from 'zustand';
import {
  OrgSettingsError,
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
  /** Why the last load failed (cleared when a load starts), or null */
  loadError: string | null;

  /** Load the settings (no-op once loaded or while loading; after a failure it tries again) */
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
  loadError: null,

  load: () => {
    if (get().loaded) return Promise.resolve();
    if (!inFlight) set({ loadError: null });
    inFlight ??= fetchOrgSettings()
      .then((settings: OrgSettings) => set({ ...settings, loaded: true, loadError: null }))
      .catch((error) => {
        console.warn('Could not load organisation settings', error);
        set({
          loadError:
            error instanceof OrgSettingsError ? error.message : 'Settings couldn’t be loaded.',
        });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  save: async (agent) => {
    const settings = await saveAgentSettings(agent);
    set({ ...settings, loaded: true, loadError: null });
  },
}));

/** The display name of the organisation's AI agent, e.g. "Timmie" */
export function useAgentName(): string {
  return useAgentSettingsStore((state) => state.agent.name);
}
